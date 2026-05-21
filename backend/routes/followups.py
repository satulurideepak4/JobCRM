from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import FollowUp, Company

router = APIRouter(tags=["followups"])


def _fu_dict(fu: FollowUp, company: Company = None) -> dict:
    return {
        "id": fu.id,
        "company_id": fu.company_id,
        "company_name": company.name if company else None,
        "company_status": company.status.value if company else None,
        "due_date": fu.due_date.isoformat() if fu.due_date else None,
        "note": fu.note,
        "completed": fu.completed,
        "completed_at": fu.completed_at.isoformat() if fu.completed_at else None,
        "created_at": fu.created_at.isoformat() if fu.created_at else None,
        "is_overdue": (not fu.completed and fu.due_date and fu.due_date < datetime.utcnow()),
    }


@router.get("/followups")
async def list_followups(db: Session = Depends(get_db)):
    follow_ups = (
        db.query(FollowUp)
        .filter(FollowUp.completed == False)
        .order_by(FollowUp.due_date)
        .all()
    )
    result = []
    for fu in follow_ups:
        company = db.query(Company).filter(Company.id == fu.company_id).first()
        result.append(_fu_dict(fu, company))
    return {"data": result, "error": None, "status": 200}


@router.post("/followups")
async def create_followup(body: dict, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == body.get("company_id")).first()
    if not company:
        return {"data": None, "error": "Company not found", "status": 404}

    due_date = datetime.utcnow()
    if body.get("due_date"):
        try:
            due_date = datetime.fromisoformat(body["due_date"])
        except ValueError:
            pass

    fu = FollowUp(
        company_id=company.id,
        due_date=due_date,
        note=body.get("note", ""),
    )
    db.add(fu)
    db.commit()
    db.refresh(fu)
    return {"data": _fu_dict(fu, company), "error": None, "status": 200}


@router.patch("/followups/{followup_id}/complete")
async def complete_followup(followup_id: int, db: Session = Depends(get_db)):
    fu = db.query(FollowUp).filter(FollowUp.id == followup_id).first()
    if not fu:
        return {"data": None, "error": "Not found", "status": 404}
    fu.completed = True
    fu.completed_at = datetime.utcnow()
    db.commit()
    company = db.query(Company).filter(Company.id == fu.company_id).first()
    return {"data": _fu_dict(fu, company), "error": None, "status": 200}


@router.delete("/followups/{followup_id}")
async def delete_followup(followup_id: int, db: Session = Depends(get_db)):
    fu = db.query(FollowUp).filter(FollowUp.id == followup_id).first()
    if not fu:
        return {"data": None, "error": "Not found", "status": 404}
    db.delete(fu)
    db.commit()
    return {"data": {"deleted": True}, "error": None, "status": 200}
