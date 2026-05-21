from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from models import Company, Email, FollowUp, CompanyStatus

router = APIRouter(tags=["applications"])


def _company_dict(c: Company) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "website": c.website,
        "linkedin_url": c.linkedin_url,
        "status": c.status.value,
        "source": c.source.value,
        "notes": c.notes,
        "added_at": c.added_at.isoformat() if c.added_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@router.get("/applications")
async def list_applications(status: str = None, db: Session = Depends(get_db)):
    q = db.query(Company)
    if status:
        try:
            q = q.filter(Company.status == CompanyStatus(status))
        except ValueError:
            pass
    companies = q.order_by(Company.updated_at.desc()).all()
    return {"data": [_company_dict(c) for c in companies], "error": None, "status": 200}


@router.post("/applications")
async def create_application(body: dict, db: Session = Depends(get_db)):
    company = Company(
        name=body.get("name", ""),
        website=body.get("website"),
        linkedin_url=body.get("linkedin_url"),
        notes=body.get("notes"),
    )
    if body.get("status"):
        try:
            company.status = CompanyStatus(body["status"])
        except ValueError:
            pass
    if body.get("source"):
        from models import CompanySource
        try:
            company.source = CompanySource(body["source"])
        except ValueError:
            pass
    db.add(company)
    db.commit()
    db.refresh(company)
    return {"data": _company_dict(company), "error": None, "status": 200}


@router.patch("/applications/{company_id}")
async def update_application(company_id: int, body: dict, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return {"data": None, "error": "Not found", "status": 404}

    if "status" in body:
        try:
            company.status = CompanyStatus(body["status"])
        except ValueError:
            pass
    if "notes" in body:
        company.notes = body["notes"]
    if "website" in body:
        company.website = body["website"]
    if "linkedin_url" in body:
        company.linkedin_url = body["linkedin_url"]
    if "name" in body:
        company.name = body["name"]

    company.updated_at = datetime.utcnow()
    db.commit()
    return {"data": _company_dict(company), "error": None, "status": 200}


@router.delete("/applications/{company_id}")
async def delete_application(company_id: int, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return {"data": None, "error": "Not found", "status": 404}
    db.delete(company)
    db.commit()
    return {"data": {"deleted": True}, "error": None, "status": 200}


@router.get("/applications/stats")
async def application_stats(db: Session = Depends(get_db)):
    companies = db.query(Company).all()
    total = len(companies)
    by_status = {}
    for c in companies:
        by_status[c.status.value] = by_status.get(c.status.value, 0) + 1

    replied = by_status.get("reply_received", 0) + by_status.get("interviewing", 0) + by_status.get("offer", 0)
    response_rate = round((replied / total * 100), 1) if total > 0 else 0.0

    # Average days to reply (companies that got replies)
    replied_companies = [c for c in companies if c.status.value in ("reply_received", "interviewing", "offer")]
    avg_days = 0.0
    if replied_companies:
        total_days = 0
        count = 0
        for c in replied_companies:
            first_email = db.query(Email).filter(Email.company_id == c.id).order_by(Email.received_at).first()
            reply_email = (
                db.query(Email)
                .filter(Email.company_id == c.id, Email.type == "reply")
                .order_by(Email.received_at)
                .first()
            )
            if first_email and reply_email and reply_email.received_at and first_email.received_at:
                days = (reply_email.received_at - first_email.received_at).days
                total_days += days
                count += 1
        avg_days = round(total_days / count, 1) if count > 0 else 0.0

    return {
        "data": {
            "total": total,
            "by_status": by_status,
            "response_rate": response_rate,
            "avg_days_to_reply": avg_days,
        },
        "error": None,
        "status": 200,
    }


@router.get("/applications/{company_id}/emails")
async def company_emails(company_id: int, db: Session = Depends(get_db)):
    emails = (
        db.query(Email)
        .filter(Email.company_id == company_id)
        .order_by(Email.received_at.desc())
        .all()
    )
    return {
        "data": [
            {
                "id": e.id,
                "type": e.type.value,
                "subject": e.subject,
                "snippet": e.snippet,
                "sender": e.sender,
                "received_at": e.received_at.isoformat() if e.received_at else None,
            }
            for e in emails
        ],
        "error": None,
        "status": 200,
    }


@router.get("/applications/{company_id}/timeline")
async def company_timeline(company_id: int, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return {"data": None, "error": "Not found", "status": 404}

    events = []
    events.append({
        "type": "company_added",
        "label": f"Company added ({company.source.value})",
        "at": company.added_at.isoformat() if company.added_at else None,
    })

    emails = (
        db.query(Email)
        .filter(Email.company_id == company_id)
        .order_by(Email.received_at)
        .all()
    )
    for e in emails:
        events.append({
            "type": f"email_{e.type.value}",
            "label": e.subject or e.type.value,
            "at": e.received_at.isoformat() if e.received_at else None,
            "snippet": e.snippet,
        })

    follow_ups = db.query(FollowUp).filter(FollowUp.company_id == company_id).all()
    for fu in follow_ups:
        if fu.completed:
            events.append({
                "type": "follow_up_completed",
                "label": f"Follow-up completed: {fu.note or ''}",
                "at": fu.completed_at.isoformat() if fu.completed_at else None,
            })

    events.sort(key=lambda x: x.get("at") or "")
    return {"data": events, "error": None, "status": 200}
