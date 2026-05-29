import asyncio
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db, SessionLocal
from models import Job, JobStatus

router = APIRouter(tags=["jobs"])
logger = logging.getLogger(__name__)

_scoring_running = False
_scoring_progress = "idle"
_scoring_total = 0
_scoring_done = 0


def _job_dict(j: Job) -> dict:
    return {
        "id": j.id,
        "title": j.title,
        "company_name": j.company_name,
        "company_website": j.company_website,
        "description": j.description,
        "location": j.location,
        "salary_range": j.salary_range,
        "job_type": j.job_type,
        "source": j.source,
        "source_url": j.source_url,
        "match_score": j.match_score,
        "match_reasons": j.match_reasons or [],
        "tags": j.tags or [],
        "status": j.status.value,
        "ai_scored": bool(j.match_score and j.match_score >= 50 and j.match_reasons and len(j.match_reasons) > 0 and isinstance(j.match_reasons[0], str) and not j.match_reasons[0].startswith("title_") and not j.match_reasons[0].startswith("skills:") and not j.match_reasons[0].startswith("secondary:") and not j.match_reasons[0].startswith("remote") and not j.match_reasons[0].startswith("has_") and not j.match_reasons[0].startswith("tag_")),
        "fetched_at": j.fetched_at.isoformat() if j.fetched_at else None,
        "applied_at": j.applied_at.isoformat() if j.applied_at else None,
    }


@router.get("/jobs")
async def list_jobs(
    min_score: int = 0,
    status: str = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    q = db.query(Job).filter(Job.match_score >= min_score)
    if status:
        try:
            q = q.filter(Job.status == JobStatus(status))
        except ValueError:
            pass
    total = q.count()
    jobs = q.order_by(Job.match_score.desc()).offset((page - 1) * limit).limit(limit).all()
    return {
        "data": {"jobs": [_job_dict(j) for j in jobs], "total": total, "page": page, "limit": limit},
        "error": None,
        "status": 200,
    }


@router.get("/jobs/latest")
async def latest_jobs(after: str = None, db: Session = Depends(get_db)):
    q = db.query(Job)
    if after:
        try:
            after_dt = datetime.fromisoformat(after)
            q = q.filter(Job.fetched_at > after_dt)
        except ValueError:
            pass
    jobs = q.order_by(Job.fetched_at.desc()).limit(50).all()
    return {"data": [_job_dict(j) for j in jobs], "error": None, "status": 200}


@router.patch("/jobs/{job_id}")
async def update_job(job_id: int, body: dict, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return {"data": None, "error": "Not found", "status": 404}

    if "status" in body:
        try:
            new_status = JobStatus(body["status"])
            job.status = new_status
            if new_status == JobStatus.applied:
                job.applied_at = datetime.utcnow()
        except ValueError:
            pass

    db.commit()
    return {"data": _job_dict(job), "error": None, "status": 200}


@router.post("/search/trigger")
async def trigger_job_search(db: Session = Depends(get_db)):
    from models import Profile
    profile = db.query(Profile).first()
    if not profile:
        return {"data": None, "error": "Please set up your profile first", "status": 400}

    from agents.job_search_agent import get_search_status, run_job_search
    status = get_search_status()
    if status["running"]:
        return {"data": {"message": "Search already running"}, "error": None, "status": 200}

    asyncio.create_task(run_job_search())
    return {"data": {"message": "Job search started"}, "error": None, "status": 200}


@router.get("/search/status")
async def search_status():
    from agents.job_search_agent import get_search_status
    status = get_search_status()
    # Merge in local scoring state too (manual re-score)
    status["scoring_running"] = status.get("scoring_running") or _scoring_running
    status["scoring_progress"] = status.get("scoring_progress") or _scoring_progress
    status["scoring_total"] = status.get("scoring_total") or _scoring_total
    status["scoring_done"] = status.get("scoring_done") or _scoring_done
    return {"data": status, "error": None, "status": 200}


@router.post("/jobs/score")
async def trigger_embedding_rescore(db: Session = Depends(get_db)):
    """
    Re-score all 'new' jobs using local embeddings (no LLM API call).
    Useful after updating your profile or resume — re-ranks existing jobs
    against your updated context.
    """
    global _scoring_running

    from agents.job_search_agent import _scoring_running as agent_scoring
    if _scoring_running or agent_scoring:
        return {"data": {"message": "Scoring already running"}, "error": None, "status": 200}

    from models import Profile
    profile_record = db.query(Profile).first()
    if not profile_record:
        return {"data": None, "error": "Please set up your profile first", "status": 400}

    # Score all jobs regardless of status, then trim below threshold
    jobs_to_score = db.query(Job).all()
    if not jobs_to_score:
        return {"data": {"message": "No jobs to score", "count": 0}, "error": None, "status": 200}

    profile = {
        "role": profile_record.role,
        "skills": profile_record.skills or [],
        "experience_years": profile_record.experience_years or 0,
        "preferences": profile_record.preferences or {},
    }
    resume_text = profile_record.resume_raw or profile_record.resume_text or None

    asyncio.create_task(_run_embedding_rescore(jobs_to_score, profile, resume_text))
    return {
        "data": {"message": f"Re-scoring {len(jobs_to_score)} jobs — will trim anything below 70", "count": len(jobs_to_score)},
        "error": None,
        "status": 200,
    }


async def _run_embedding_rescore(jobs, profile: dict, resume_text: str = None):
    """Re-score existing DB jobs using local embeddings — zero LLM calls."""
    global _scoring_running, _scoring_progress, _scoring_total, _scoring_done

    _scoring_running = True
    _scoring_total = len(jobs)
    _scoring_done = 0
    _scoring_progress = f"embedding {_scoring_total} jobs…"

    db = SessionLocal()
    try:
        from services.embedder import embed_profile, embed_jobs_batch, score_jobs

        # Convert ORM objects to dicts for the embedder
        job_dicts = [
            {
                "id": j.id,
                "title": j.title,
                "company_name": j.company_name,
                "description": j.description or "",
                "tags": j.tags or [],
            }
            for j in jobs
        ]

        # Run embedding in thread pool (CPU-bound, keeps event loop free)
        import numpy as np
        profile_vector = await asyncio.get_event_loop().run_in_executor(
            None, lambda: embed_profile(profile, resume_text)
        )
        job_vectors = await asyncio.get_event_loop().run_in_executor(
            None, lambda: embed_jobs_batch(job_dicts)
        )
        scores = score_jobs(profile_vector, job_vectors)

        MIN_SCORE = 70

        # Write scores back and collect IDs to delete
        ids_to_delete = []
        for job_orm, score in zip(jobs, scores):
            j = db.query(Job).filter(Job.id == job_orm.id).first()
            if j:
                if round(score) < MIN_SCORE:
                    ids_to_delete.append(j.id)
                else:
                    j.match_score = round(score)
                    j.match_reasons = [f"semantic similarity: {score:.1f}/100"]
            _scoring_done += 1

        # Delete below-threshold jobs
        if ids_to_delete:
            db.query(Job).filter(Job.id.in_(ids_to_delete)).delete(synchronize_session=False)

        db.commit()
        trimmed = len(ids_to_delete)
        kept = _scoring_total - trimmed
        _scoring_progress = f"done — {kept} jobs kept, {trimmed} below 70 removed"
        logger.info(f"Rescore complete: {kept} kept, {trimmed} trimmed")

    except Exception as e:
        logger.error(f"Embedding rescore failed: {e}", exc_info=True)
        _scoring_progress = f"failed: {e}"
    finally:
        db.close()
        _scoring_running = False


@router.post("/jobs/clean")
async def clean_irrelevant_jobs(db: Session = Depends(get_db)):
    """
    Re-runs local_filter against the current profile on all 'new' unscored jobs.
    Deletes jobs that no longer pass — lets the user start fresh after
    tightening filter settings.
    """
    from models import Profile
    profile_record = db.query(Profile).first()
    if not profile_record:
        return {"data": None, "error": "No profile set up", "status": 400}

    from services.scorer import local_filter

    # Only clean unscored 'new' jobs (match_score == 0)
    candidates = db.query(Job).filter(
        Job.status == JobStatus.new,
        Job.match_score == 0,
    ).all()

    if not candidates:
        return {"data": {"deleted": 0, "message": "Nothing to clean"}, "error": None, "status": 200}

    profile = {
        "role": profile_record.role,
        "skills": profile_record.skills or [],
        "experience_years": profile_record.experience_years or 0,
        "preferences": profile_record.preferences or {},
    }

    # Convert ORM objects to dicts for local_filter
    job_dicts = [
        {
            "id": j.id, "title": j.title, "description": j.description or "",
            "location": j.location or "", "tags": j.tags or [],
            "salary_range": j.salary_range, "company_website": j.company_website,
        }
        for j in candidates
    ]

    passing_ids = {jd["id"] for jd in local_filter(job_dicts, profile)}
    to_delete = [j for j in candidates if j.id not in passing_ids]

    for job in to_delete:
        db.delete(job)
    db.commit()

    return {
        "data": {"deleted": len(to_delete), "kept": len(passing_ids),
                 "message": f"Removed {len(to_delete)} irrelevant jobs"},
        "error": None,
        "status": 200,
    }


@router.delete("/jobs/all")
async def delete_all_jobs(db: Session = Depends(get_db)):
    """Wipe all jobs and start fresh. Must be defined before /jobs/{job_id}."""
    count = db.query(Job).count()
    db.query(Job).delete()
    db.commit()
    return {"data": {"deleted": count, "message": f"Deleted all {count} jobs. Ready for a fresh search."}, "error": None, "status": 200}


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return {"data": None, "error": "Not found", "status": 404}
    db.delete(job)
    db.commit()
    return {"data": {"deleted": job_id}, "error": None, "status": 200}


@router.get("/jobs/score/status")
async def ai_scoring_status():
    return {
        "data": {
            "running": _scoring_running,
            "progress": _scoring_progress,
            "total": _scoring_total,
            "done": _scoring_done,
        },
        "error": None,
        "status": 200,
    }
