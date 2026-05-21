from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Company, Job, FollowUp, Email, SyncLog, SyncType, CompanyStatus, JobStatus

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
async def get_dashboard(db: Session = Depends(get_db)):
    companies = db.query(Company).all()
    total_applied = len(companies)

    interviewing = sum(1 for c in companies if c.status == CompanyStatus.interviewing)
    replied = sum(1 for c in companies if c.status in (
        CompanyStatus.reply_received, CompanyStatus.interviewing, CompanyStatus.offer
    ))
    response_rate = round((replied / total_applied * 100), 1) if total_applied > 0 else 0.0

    follow_ups = db.query(FollowUp).filter(FollowUp.completed == False).all()
    overdue_count = sum(1 for fu in follow_ups if fu.due_date and fu.due_date < datetime.utcnow())

    stats = {
        "total_applied": total_applied,
        "response_rate": response_rate,
        "interviewing": interviewing,
        "followups_due": len(follow_ups),
        "followups_overdue": overdue_count,
    }

    # Kanban columns
    kanban_statuses = [
        CompanyStatus.cold_email_sent,
        CompanyStatus.applied,
        CompanyStatus.reply_received,
        CompanyStatus.interviewing,
        CompanyStatus.offer,
        CompanyStatus.rejected,
        CompanyStatus.ghosted,
    ]
    kanban = {}
    now = datetime.utcnow()
    for status in kanban_statuses:
        status_companies = [c for c in companies if c.status == status]
        kanban[status.value] = [
            {
                "id": c.id,
                "name": c.name,
                "status": c.status.value,
                "days_since_update": (now - c.updated_at).days if c.updated_at else 0,
                "source": c.source.value,
            }
            for c in status_companies
        ]

    # Today's top 5 jobs
    todays_jobs = (
        db.query(Job)
        .filter(Job.status == JobStatus.new, Job.match_score >= 50)
        .order_by(Job.match_score.desc())
        .limit(5)
        .all()
    )
    todays_jobs_data = [
        {
            "id": j.id,
            "title": j.title,
            "company_name": j.company_name,
            "match_score": j.match_score,
            "tags": j.tags or [],
            "source_url": j.source_url,
            "location": j.location,
        }
        for j in todays_jobs
    ]

    # Pending follow-ups
    pending_fus = (
        db.query(FollowUp)
        .filter(FollowUp.completed == False)
        .order_by(FollowUp.due_date)
        .limit(10)
        .all()
    )
    pending_followups = []
    for fu in pending_fus:
        company = db.query(Company).filter(Company.id == fu.company_id).first()
        pending_followups.append({
            "id": fu.id,
            "company_id": fu.company_id,
            "company_name": company.name if company else None,
            "due_date": fu.due_date.isoformat() if fu.due_date else None,
            "note": fu.note,
            "is_overdue": fu.due_date and fu.due_date < now,
        })

    # Recent activity (last 10 companies updated)
    recent = (
        db.query(Company)
        .order_by(Company.updated_at.desc())
        .limit(10)
        .all()
    )
    recent_activity = [
        {
            "company": c.name,
            "status": c.status.value,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in recent
    ]

    # Last sync info
    last_sync = (
        db.query(SyncLog)
        .filter(SyncLog.sync_type == SyncType.gmail)
        .order_by(SyncLog.completed_at.desc())
        .first()
    )

    return {
        "data": {
            "stats": stats,
            "kanban": kanban,
            "todays_jobs": todays_jobs_data,
            "pending_followups": pending_followups,
            "recent_activity": recent_activity,
            "last_synced_at": last_sync.completed_at.isoformat() if last_sync and last_sync.completed_at else None,
        },
        "error": None,
        "status": 200,
    }
