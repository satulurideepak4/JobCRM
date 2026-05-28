import asyncio
import logging
from datetime import datetime
from typing import Optional, List, Dict
from database import SessionLocal
from models import Job, Company, SyncLog, SyncType, SyncStatus, JobStatus
import llm_service

logger = logging.getLogger(__name__)

_search_running = False
_search_started_at: Optional[datetime] = None
_search_progress = "idle"
_latest_job_ids: List[int] = []

# Shared scoring state (also used by routes/jobs.py)
_scoring_running = False
_scoring_progress = "idle"
_scoring_total = 0
_scoring_done = 0


def get_search_status():
    return {
        "running": _search_running,
        "started_at": _search_started_at.isoformat() if _search_started_at else None,
        "progress": _search_progress,
        "scoring_running": _scoring_running,
        "scoring_progress": _scoring_progress,
        "scoring_total": _scoring_total,
        "scoring_done": _scoring_done,
    }


def get_latest_job_ids():
    return _latest_job_ids


async def _build_search_queries(profile: Dict) -> List[Dict]:
    """Use LLM to generate diverse search queries from the profile."""
    prompt = (
        f"Given this job-seeker profile: role={profile.get('role', '')}, "
        f"skills={profile.get('skills', [])}, "
        f"experience={profile.get('experience_years', 0)} years, "
        f"preferences={profile.get('preferences', {})}.\n"
        "Generate 5 diverse search queries optimised for remote job boards.\n"
        'Reply only in JSON: {"queries": [{"query": <str>, "keywords": [<str>]}]}'
    )
    try:
        result = await llm_service.generate(prompt)
        if isinstance(result, dict):
            return result.get("queries", [])
    except Exception as e:
        logger.warning(f"Query generation failed: {e}")

    return [{"query": f"{profile.get('role', 'software engineer')} remote",
             "keywords": profile.get("skills", [])[:3]}]


async def _run_workday_search(profile: Dict) -> List[Dict]:
    """DDG-powered search for Workday-hosted job postings."""
    try:
        from langchain_community.tools import DuckDuckGoSearchRun
        from langchain.agents import AgentExecutor, create_react_agent
        from langchain.prompts import PromptTemplate
        import json
        import re

        llm = llm_service.get_langchain_llm()
        search_tool = DuckDuckGoSearchRun()

        template = """You are a job search assistant finding Workday-hosted job postings.

Search for remote {role} jobs on Workday job boards using the search tool.
Use queries like: site:myworkdayjobs.com {role} remote

For each job found, extract: title, company name, URL, and a brief description.
Return ONLY a JSON array: [{{"title": str, "company": str, "url": str, "description": str}}]

Tools: {tools}
Tool Names: {tool_names}
{agent_scratchpad}

Query: {input}"""

        prompt = PromptTemplate(
            template=template,
            input_variables=["input", "tools", "tool_names", "agent_scratchpad", "role"],
        )

        agent = create_react_agent(llm, [search_tool], prompt)
        executor = AgentExecutor(
            agent=agent,
            tools=[search_tool],
            verbose=False,
            max_iterations=4,
            handle_parsing_errors=True,
        )

        role = profile.get("role", "software engineer")
        top_skills = profile.get("skills", [])[:2]
        query = f"site:myworkdayjobs.com {role} {' '.join(top_skills)} remote"

        result = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: executor.invoke({"input": query, "role": role}),
        )

        output = result.get("output", "")
        match = re.search(r'\[.*\]', output, re.DOTALL)
        if match:
            jobs = json.loads(match.group())
            return [
                {
                    "title": j.get("title", ""),
                    "company_name": j.get("company", ""),
                    "company_website": "",
                    "description": j.get("description", ""),
                    "location": "Remote",
                    "salary_range": "",
                    "job_type": "full-time",
                    "source": "workday",
                    "source_url": j.get("url", ""),
                    "tags": [],
                }
                for j in jobs
                if j.get("url") and j.get("title")
            ]
    except Exception as e:
        logger.warning(f"Workday search failed (non-blocking): {e}")

    return []


async def run_job_search():
    """
    Full job search pipeline:
    1. Build LLM-generated queries
    2. Fetch from all sources (Remotive, Arbeitnow, JSearch, Remoteok, ATS boards, HN, Workday)
    3. Deduplicate + local filter
    4. Save to DB
    5. Auto-run AI scoring with resume context
    """
    global _search_running, _search_started_at, _search_progress, _latest_job_ids

    if _search_running:
        logger.info("Job search already running, skipping.")
        return []

    _search_running = True
    _search_started_at = datetime.utcnow()
    _search_progress = "starting"
    _latest_job_ids = []

    db = SessionLocal()
    log = SyncLog(sync_type=SyncType.job_search, started_at=datetime.utcnow())
    db.add(log)
    db.commit()

    new_job_ids = []

    try:
        from models import Profile
        profile_record = db.query(Profile).first()
        if not profile_record:
            raise ValueError("No profile found. Please set up your profile first.")

        profile = {
            "role": profile_record.role,
            "skills": profile_record.skills or [],
            "experience_years": profile_record.experience_years or 0,
            "preferences": profile_record.preferences or {},
        }

        # Resume text for LLM scoring (raw resume is richer than parsed summary)
        resume_text = profile_record.resume_raw or profile_record.resume_text or None

        applied_companies = {c.name.lower() for c in db.query(Company).all()}

        _search_progress = "building search queries"
        queries = await _build_search_queries(profile)

        _search_progress = "fetching from all job sources (this takes ~30s)..."

        from services.job_boards import fetch_all_jobs
        from services.job_boards_ats import fetch_ats_jobs
        from services.job_boards_hn import fetch_hn_hiring

        api_jobs, ats_jobs, workday_jobs, hn_jobs = await asyncio.gather(
            fetch_all_jobs(profile, queries),   # Remotive + Arbeitnow + JSearch + Remoteok
            fetch_ats_jobs(profile),            # Greenhouse + Lever + Ashby (role-aware)
            _run_workday_search(profile),       # DDG Workday search
            fetch_hn_hiring(profile),           # HN Who's Hiring
            return_exceptions=True,
        )

        all_jobs = []
        source_counts = {}
        for source_name, source in [
            ("api_boards", api_jobs),
            ("ats", ats_jobs),
            ("workday", workday_jobs),
            ("hn", hn_jobs),
        ]:
            if isinstance(source, list):
                all_jobs.extend(source)
                source_counts[source_name] = len(source)
            elif isinstance(source, Exception):
                logger.warning(f"Source {source_name} error: {source}")
                source_counts[source_name] = 0

        logger.info(f"Raw fetch counts: {source_counts}")
        _search_progress = f"fetched {len(all_jobs)} raw jobs, deduplicating..."

        # Deduplicate by URL and dedup_key
        seen_urls = set()
        seen_keys = set()
        deduped = []
        for job in all_jobs:
            url = job.get("source_url", "")
            if not url:
                continue
            if db.query(Job).filter(Job.source_url == url).first():
                continue
            if url in seen_urls:
                continue
            from models import Job as JobModel
            key = job.get("dedup_key") or JobModel.dedup_key(
                job.get("company_name", ""), job.get("title", "")
            )
            if key in seen_keys:
                continue
            if job.get("company_name", "").lower() in applied_companies:
                continue
            seen_urls.add(url)
            seen_keys.add(key)
            deduped.append(job)

        _search_progress = f"{len(deduped)} unique jobs — running resume-based filter..."

        # Stage 1: local keyword filter (instant, no LLM)
        from services.scorer import local_filter
        filtered_jobs = local_filter(deduped, profile)
        _search_progress = (
            f"local filter: {len(filtered_jobs)}/{len(deduped)} matched your profile — saving..."
        )

        # Save locally-filtered jobs
        for job_data in filtered_jobs:
            tags = job_data.get("tags", [])
            if tags and isinstance(tags[0], dict):
                tags = [t.get("label", str(t)) for t in tags]
            tags = [str(t) for t in tags if t]

            job = Job(
                title=job_data.get("title", ""),
                company_name=job_data.get("company_name", ""),
                company_website=job_data.get("company_website", ""),
                description=job_data.get("description", ""),
                location=job_data.get("location", ""),
                salary_range=job_data.get("salary_range", ""),
                job_type=job_data.get("job_type", ""),
                source=job_data.get("source", ""),
                source_url=job_data.get("source_url", ""),
                match_score=job_data.get("local_score", 0),
                match_reasons=job_data.get("local_reasons", []),
                tags=tags,
                status=JobStatus.new,
            )
            db.add(job)
            try:
                db.commit()
                db.refresh(job)
                new_job_ids.append(job.id)
            except Exception:
                db.rollback()

        _latest_job_ids = new_job_ids

        log.status = SyncStatus.success
        log.jobs_fetched = len(new_job_ids)
        log.completed_at = datetime.utcnow()
        db.commit()

        _search_progress = (
            f"saved {len(new_job_ids)} matching jobs — starting AI scoring with your resume..."
        )

        # Stage 2: auto-trigger AI scoring (no manual click needed)
        if new_job_ids:
            asyncio.create_task(
                _run_ai_scoring_task(new_job_ids, profile, resume_text)
            )

    except Exception as e:
        logger.error(f"Job search failed: {e}", exc_info=True)
        log.status = SyncStatus.failed
        log.error_message = str(e)
        log.completed_at = datetime.utcnow()
        db.commit()
        _search_progress = f"failed: {e}"
    finally:
        db.close()
        _search_running = False

    return new_job_ids


async def _run_ai_scoring_task(
    job_ids: List[int],
    profile: Dict,
    resume_text: Optional[str] = None,
):
    """
    AI scoring task — runs automatically after job search completes.
    Uses resume text for richer match context when available.
    """
    global _scoring_running, _scoring_progress, _scoring_total, _scoring_done, _search_progress

    if _scoring_running:
        logger.info("AI scoring already running, skipping auto-trigger.")
        return

    _scoring_running = True
    _scoring_total = len(job_ids)
    _scoring_done = 0
    _scoring_progress = f"scoring 0/{_scoring_total} jobs against your resume..."

    resume_note = " (with resume context)" if resume_text else ""
    logger.info(f"Auto-scoring {len(job_ids)} jobs{resume_note}")

    db = SessionLocal()
    try:
        from services.scorer import score_jobs_batch_llm
        batch_size = 20

        for i in range(0, len(job_ids), batch_size):
            batch = job_ids[i:i + batch_size]
            scores = await score_jobs_batch_llm(batch, profile, resume_text=resume_text)

            for job_id, score_data in scores.items():
                job = db.query(Job).filter(Job.id == job_id).first()
                if job:
                    job.match_score = score_data["score"]
                    job.match_reasons = score_data["reasons"]
                    if score_data.get("tags"):
                        job.tags = score_data["tags"]

            db.commit()
            _scoring_done += len(batch)
            _scoring_progress = f"scoring {_scoring_done}/{_scoring_total} jobs..."

        _scoring_progress = f"done — {_scoring_total} jobs scored. Showing best matches first."
        _search_progress = (
            f"complete — {_scoring_total} jobs found and scored. "
            "Check 'Job Search' to see your matches."
        )

    except Exception as e:
        logger.error(f"AI scoring failed: {e}", exc_info=True)
        _scoring_progress = f"scoring failed: {e}"
    finally:
        db.close()
        _scoring_running = False
