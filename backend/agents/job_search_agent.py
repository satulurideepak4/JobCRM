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


def get_search_status():
    return {
        "running": _search_running,
        "started_at": _search_started_at.isoformat() if _search_started_at else None,
        "progress": _search_progress,
    }


def get_latest_job_ids():
    return _latest_job_ids


async def _build_search_queries(profile: Dict) -> List[Dict]:
    prompt = f"""Given this profile: role={profile.get('role', '')}, skills={profile.get('skills', [])}, experience={profile.get('experience_years', 0)} years, preferences={profile.get('preferences', {})}.
Generate 5 diverse search queries optimized for remote job boards.
Reply only in JSON: {{"queries": [{{"query": <str>, "keywords": [<str>]}}]}}"""

    try:
        result = await llm_service.generate(prompt)
        if isinstance(result, dict):
            return result.get("queries", [])
    except Exception as e:
        logger.warning(f"Query generation failed: {e}")

    return [{"query": f"{profile.get('role', 'software engineer')} remote", "keywords": profile.get("skills", [])[:3]}]


async def _run_workday_search(profile: Dict) -> List[Dict]:
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

        applied_companies = {c.name.lower() for c in db.query(Company).all()}

        _search_progress = "building search queries"
        queries = await _build_search_queries(profile)

        _search_progress = "fetching from job boards and ATS platforms"
        from services.job_boards import fetch_all_jobs
        from services.job_boards_ats import fetch_ats_jobs
        from services.job_boards_hn import fetch_hn_hiring

        api_jobs, ats_jobs, workday_jobs, hn_jobs = await asyncio.gather(
            fetch_all_jobs(profile, queries),
            fetch_ats_jobs(profile),
            _run_workday_search(profile),
            fetch_hn_hiring(profile),
            return_exceptions=True,
        )

        all_jobs = []
        for source in [api_jobs, ats_jobs, workday_jobs, hn_jobs]:
            if isinstance(source, list):
                all_jobs.extend(source)
            elif isinstance(source, Exception):
                logger.warning(f"Source error: {source}")

        _search_progress = f"fetched {len(all_jobs)} jobs, running local filter"

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
            key = job.get("dedup_key") or JobModel.dedup_key(job.get("company_name", ""), job.get("title", ""))
            if key in seen_keys:
                continue
            if job.get("company_name", "").lower() in applied_companies:
                continue
            seen_urls.add(url)
            seen_keys.add(key)
            deduped.append(job)

        # Stage 1: local keyword filter (no LLM, instant)
        from services.scorer import local_filter
        filtered_jobs = local_filter(deduped, profile)
        _search_progress = f"local filter: {len(filtered_jobs)} of {len(deduped)} jobs passed, saving"

        # Save all locally-filtered jobs immediately (ai_scored=False)
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
        _search_progress = f"completed — {len(new_job_ids)} jobs saved. Click 'Score with AI' for ranked results."

    except Exception as e:
        logger.error(f"Job search failed: {e}")
        log.status = SyncStatus.failed
        log.error_message = str(e)
        log.completed_at = datetime.utcnow()
        db.commit()
        _search_progress = f"failed: {e}"
    finally:
        db.close()
        _search_running = False

    return new_job_ids
