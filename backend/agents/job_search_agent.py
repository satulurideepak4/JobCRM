"""
Job search agent — fetches jobs from all sources and ranks them by
semantic similarity to the user's profile using local embeddings.

LLM API calls: ZERO.
All ranking is done by sentence-transformers running locally on CPU.
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional, List, Dict
from database import SessionLocal
from models import Job, Company, SyncLog, SyncType, SyncStatus, JobStatus

logger = logging.getLogger(__name__)

_search_running = False
_search_started_at: Optional[datetime] = None
_search_progress = "idle"
_latest_job_ids: List[int] = []

# Scoring state — read by routes/jobs.py for the status endpoint
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


# ── Query builder (deterministic — no LLM needed) ─────────────────────────────

def _build_search_queries(profile: Dict) -> List[Dict]:
    """
    Build diverse search queries directly from the profile.
    No LLM call — the profile already has everything we need.

    Generates queries at different specificity levels so we cast a wide net:
      - Exact role title
      - Role + top skills
      - Role variants (senior, staff, etc.)
      - Skills-only (catches jobs that don't use your exact title)
    """
    role = (profile.get("role") or "software engineer").strip()
    skills = profile.get("skills") or []
    top_skills = [s for s in skills[:6] if s]

    queries = []

    # Base role query
    queries.append({"query": f"{role} remote", "keywords": top_skills})

    # Role + top 2 skills
    if top_skills:
        skill_combo = " ".join(top_skills[:2])
        queries.append({"query": f"{role} {skill_combo} remote", "keywords": top_skills})

    # Senior/staff variant (catches higher-level postings)
    role_words = role.lower().split()
    level_words = {"senior", "staff", "principal", "lead", "junior", "mid"}
    base_role = " ".join(w for w in role_words if w not in level_words)
    if base_role and base_role != role.lower():
        queries.append({"query": f"senior {base_role} remote", "keywords": top_skills})

    # Skills-only query (catches jobs with creative titles)
    if len(top_skills) >= 2:
        queries.append({"query": f"{' '.join(top_skills[:3])} engineer remote", "keywords": top_skills})

    # Deduplicate
    seen = set()
    unique = []
    for q in queries:
        key = q["query"].lower()
        if key not in seen:
            seen.add(key)
            unique.append(q)

    logger.info(f"Built {len(unique)} search queries from profile (no LLM)")
    return unique


# ── Main job search pipeline ───────────────────────────────────────────────────

async def run_job_search():
    """
    Full job search pipeline — zero LLM API calls:
    1. Build search queries from profile (deterministic)
    2. Fetch from all sources in parallel (Remotive, Arbeitnow, JSearch, RemoteOK,
       Greenhouse, Lever, Ashby, HN Who's Hiring)
    3. Deduplicate by URL + content hash
    4. Keyword pre-filter (fast gate — removes obviously wrong jobs)
    5. Semantic ranking with local embeddings (all-MiniLM-L6-v2, runs on CPU)
    6. Save top-ranked jobs to DB with embedding score
    """
    global _search_running, _search_started_at, _search_progress, _latest_job_ids

    if _search_running:
        logger.info("Job search already running — skipping.")
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
            raise ValueError("No profile found. Set up your profile first.")

        profile = {
            "role": profile_record.role,
            "skills": profile_record.skills or [],
            "experience_years": profile_record.experience_years or 0,
            "preferences": profile_record.preferences or {},
        }
        resume_text = profile_record.resume_raw or profile_record.resume_text or None

        applied_companies = {c.name.lower() for c in db.query(Company).all()}

        # ── Step 1: build queries (no LLM) ───────────────────────────────────
        queries = _build_search_queries(profile)

        # ── Step 2: fetch all sources in parallel ─────────────────────────────
        _search_progress = "fetching jobs from all sources…"

        from services.job_boards import fetch_all_jobs
        from services.job_boards_ats import fetch_ats_jobs
        from services.job_boards_hn import fetch_hn_hiring
        from services.job_boards_extra import fetch_extra_jobs
        from services.job_boards_yc import fetch_yc_jobs

        api_jobs, ats_jobs, hn_jobs, extra_jobs, yc_jobs = await asyncio.gather(
            fetch_all_jobs(profile, queries),   # Remotive + Arbeitnow + JSearch + RemoteOK
            fetch_ats_jobs(profile),            # Greenhouse + Lever + Ashby + Workable (500+ companies)
            fetch_hn_hiring(profile),           # HN Who's Hiring (monthly thread)
            fetch_extra_jobs(profile),          # WWR + Muse + Himalayas + WorkNomads + Remote.co
            fetch_yc_jobs(profile),             # YC job board feed (last 20 days)
            return_exceptions=True,
        )

        all_raw: List[Dict] = []
        source_counts = {}
        for name, result in [
            ("api_boards", api_jobs),
            ("ats", ats_jobs),
            ("hn", hn_jobs),
            ("extra", extra_jobs),
            ("yc", yc_jobs),
        ]:
            if isinstance(result, list):
                all_raw.extend(result)
                source_counts[name] = len(result)
            else:
                logger.warning(f"Source '{name}' failed: {result}")
                source_counts[name] = 0

        logger.info(f"Raw fetch totals: {source_counts} → {len(all_raw)} total")
        _search_progress = f"fetched {len(all_raw)} raw jobs — deduplicating…"

        # ── Step 3: deduplicate ───────────────────────────────────────────────
        seen_urls: set = set()
        seen_keys: set = set()
        deduped: List[Dict] = []

        existing_urls = {row[0] for row in db.query(Job.source_url).all()}

        for job in all_raw:
            url = job.get("source_url", "")
            if not url:
                continue
            if url in existing_urls or url in seen_urls:
                continue
            if job.get("company_name", "").lower() in applied_companies:
                continue

            from models import Job as JobModel
            key = job.get("dedup_key") or JobModel.dedup_key(
                job.get("company_name", ""), job.get("title", "")
            )
            if key in seen_keys:
                continue

            seen_urls.add(url)
            seen_keys.add(key)
            deduped.append(job)

        _search_progress = f"{len(deduped)} unique new jobs — keyword pre-filter…"

        # ── Step 4: keyword pre-filter (fast, free) ───────────────────────────
        from services.scorer import local_filter
        keyword_passed = local_filter(deduped, profile)
        logger.info(f"Keyword filter: {len(keyword_passed)}/{len(deduped)} passed")
        _search_progress = (
            f"keyword filter: {len(keyword_passed)} candidates — "
            "running semantic ranking (local AI, no API)…"
        )

        # ── Step 5: semantic ranking with local embeddings ────────────────────
        from services.embedder import rank_jobs_by_relevance

        ranked = await asyncio.get_event_loop().run_in_executor(
            None,  # default thread pool
            lambda: rank_jobs_by_relevance(
                keyword_passed,
                profile,
                resume_text=resume_text,
                top_n=60,        # quality over quantity — top 60 strong matches
                min_score=70.0,  # raised threshold: 70+ = genuine match
            ),
        )

        _search_progress = f"ranked {len(ranked)} relevant jobs — saving…"
        logger.info(f"Embedding ranking done: {len(ranked)} jobs pass threshold")

        # ── Step 6: save to DB ────────────────────────────────────────────────
        import re, html as html_mod

        def _clean_desc(text: str) -> str:
            if not text:
                return ""
            text = html_mod.unescape(text)
            text = re.sub(r"<[^>]+>", " ", text)
            return re.sub(r"\s+", " ", text).strip()

        for job_data, embed_score in ranked:
            tags = job_data.get("tags", [])
            if tags and isinstance(tags[0], dict):
                tags = [t.get("label", str(t)) for t in tags]
            tags = [str(t) for t in tags if t]

            job = Job(
                title=job_data.get("title", ""),
                company_name=job_data.get("company_name", ""),
                company_website=job_data.get("company_website", ""),
                description=_clean_desc(job_data.get("description", "")),
                location=job_data.get("location", ""),
                salary_range=job_data.get("salary_range", ""),
                job_type=job_data.get("job_type", ""),
                source=job_data.get("source", ""),
                source_url=job_data.get("source_url", ""),
                match_score=round(embed_score),
                match_reasons=[f"semantic similarity: {embed_score:.1f}/100"],
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

        # ── Step 7: LLM re-rank saved jobs ───────────────────────────────────
        # Embeddings do broad filtering; LLM does precise role/context reasoning.
        # Runs on the saved jobs only — cost is pennies (Gemini Flash / Grok mini).
        _search_progress = f"embedding done — running LLM re-ranking on {len(new_job_ids)} jobs…"

        try:
            from services.scorer import score_jobs_batch_llm
            llm_scores = await score_jobs_batch_llm(new_job_ids, profile, resume_text)

            LLM_MIN = 65  # jobs below this get deleted — not a real match
            ids_to_delete = []
            for job_id, result in llm_scores.items():
                score = result.get("score", 0)
                reasons = result.get("reasons", [])
                j = db.query(Job).filter(Job.id == job_id).first()
                if not j:
                    continue
                if score < LLM_MIN:
                    ids_to_delete.append(job_id)
                else:
                    j.match_score = score
                    j.match_reasons = reasons[:3]

            if ids_to_delete:
                db.query(Job).filter(Job.id.in_(ids_to_delete)).delete(synchronize_session=False)
                new_job_ids = [jid for jid in new_job_ids if jid not in ids_to_delete]

            db.commit()
            logger.info(f"LLM re-rank: kept {len(new_job_ids)}, removed {len(ids_to_delete)}")
        except Exception as e:
            logger.warning(f"LLM re-rank failed (keeping embedding scores): {e}")

        _latest_job_ids = new_job_ids

        log.status = SyncStatus.success
        log.jobs_fetched = len(new_job_ids)
        log.completed_at = datetime.utcnow()
        db.commit()

        _search_progress = (
            f"done — {len(new_job_ids)} jobs matched and LLM-ranked against your profile. "
            "Best matches shown first."
        )
        logger.info(f"Job search complete: {len(new_job_ids)} jobs saved")

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
