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
    return {"data": status, "error": None, "status": 200}


@router.post("/jobs/score")
async def trigger_ai_scoring(db: Session = Depends(get_db)):
    global _scoring_running

    if _scoring_running:
        return {"data": {"message": "Scoring already running"}, "error": None, "status": 200}

    from models import Profile
    profile_record = db.query(Profile).first()
    if not profile_record:
        return {"data": None, "error": "Please set up your profile first", "status": 400}

    # Get all new jobs that haven't been AI scored yet
    # AI-unscored jobs have match_reasons that are local filter tags (title_match, skills:x, etc.)
    unscored = db.query(Job).filter(Job.status == JobStatus.new).all()
    local_tag_prefixes = ("title_match", "skills:", "secondary:", "remote", "has_salary", "tag_match")
    to_score = [
        j for j in unscored
        if not j.match_reasons or (
            j.match_reasons and isinstance(j.match_reasons[0], str) and
            any(j.match_reasons[0].startswith(p) for p in local_tag_prefixes)
        )
    ]

    if not to_score:
        return {"data": {"message": "No jobs to score", "count": 0}, "error": None, "status": 200}

    job_ids = [j.id for j in to_score]
    profile = {
        "role": profile_record.role,
        "skills": profile_record.skills or [],
        "experience_years": profile_record.experience_years or 0,
        "preferences": profile_record.preferences or {},
    }

    asyncio.create_task(_run_ai_scoring(job_ids, profile))
    return {"data": {"message": f"AI scoring started for {len(job_ids)} jobs", "count": len(job_ids)}, "error": None, "status": 200}


async def _run_ai_scoring(job_ids: list, profile: dict):
    global _scoring_running, _scoring_progress, _scoring_total, _scoring_done

    _scoring_running = True
    _scoring_total = len(job_ids)
    _scoring_done = 0
    _scoring_progress = f"scoring 0 of {_scoring_total} jobs"

    db = SessionLocal()
    try:
        from services.scorer import score_jobs_batch_llm
        batch_size = 20
        for i in range(0, len(job_ids), batch_size):
            batch = job_ids[i:i + batch_size]
            scores = await score_jobs_batch_llm(batch, profile)

            for job_id, score_data in scores.items():
                job = db.query(Job).filter(Job.id == job_id).first()
                if job:
                    job.match_score = score_data["score"]
                    job.match_reasons = score_data["reasons"]
                    if score_data.get("tags"):
                        job.tags = score_data["tags"]

            db.commit()
            _scoring_done += len(batch)
            _scoring_progress = f"scoring {_scoring_done} of {_scoring_total} jobs"

        _scoring_progress = f"completed — {_scoring_total} jobs scored"
    except Exception as e:
        logger.error(f"AI scoring failed: {e}")
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
