from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Email, Company
import llm_service

router = APIRouter(tags=["emails"])


@router.post("/emails/draft")
async def draft_cold_email(body: dict, db: Session = Depends(get_db)):
    from models import Profile
    profile = db.query(Profile).first()
    if not profile:
        return {"data": None, "error": "Please set up your profile first", "status": 400}

    company_name = body.get("company_name", "")
    role = body.get("role", "")
    job_description = body.get("job_description", "")

    if body.get("company_id"):
        company = db.query(Company).filter(Company.id == body["company_id"]).first()
        if company:
            company_name = company.name

    prompt = f"""Draft a cold email from {profile.name} to {company_name} for the role of {role}.
Profile: skills={profile.skills}, experience={profile.experience_years} years.
Job context: {job_description[:500] if job_description else 'Not provided'}.
Write in a natural human tone, not AI-sounding. No generic phrases. Reference something specific about the company or role.
Keep under 150 words. Include subject line.
Reply only in JSON: {{"subject": <str>, "body": <str>}}"""

    try:
        result = await llm_service.generate(prompt)
        if isinstance(result, dict):
            return {"data": result, "error": None, "status": 200}
        return {"data": {"subject": "", "body": str(result)}, "error": None, "status": 200}
    except Exception as e:
        return {"data": None, "error": str(e), "status": 500}


@router.post("/emails/draft/followup")
async def draft_followup_email(body: dict, db: Session = Depends(get_db)):
    from models import Profile
    profile = db.query(Profile).first()
    if not profile:
        return {"data": None, "error": "Please set up your profile first", "status": 400}

    company = db.query(Company).filter(Company.id == body.get("company_id")).first()
    if not company:
        return {"data": None, "error": "Company not found", "status": 404}

    first_email = (
        db.query(Email)
        .filter(Email.company_id == company.id, Email.type == "cold_sent")
        .order_by(Email.received_at)
        .first()
    )

    original_subject = first_email.subject if first_email else "our earlier conversation"

    prompt = f"""Draft a brief follow-up email from {profile.name} to {company.name}.
This follows a previous cold email about a job opportunity.
Original subject: {original_subject}.
Profile: skills={profile.skills}, experience={profile.experience_years} years.
Keep it short, friendly, and professional. Under 100 words.
Reply only in JSON: {{"subject": <str>, "body": <str>}}"""

    try:
        result = await llm_service.generate(prompt)
        if isinstance(result, dict):
            return {"data": result, "error": None, "status": 200}
        return {"data": {"subject": f"Re: {original_subject}", "body": str(result)}, "error": None, "status": 200}
    except Exception as e:
        return {"data": None, "error": str(e), "status": 500}


@router.get("/emails")
async def list_emails(company_id: int = None, db: Session = Depends(get_db)):
    q = db.query(Email)
    if company_id:
        q = q.filter(Email.company_id == company_id)
    emails = q.order_by(Email.received_at.desc()).all()
    return {
        "data": [
            {
                "id": e.id,
                "company_id": e.company_id,
                "type": e.type.value,
                "subject": e.subject,
                "snippet": e.snippet,
                "sender": e.sender,
                "recipient": e.recipient,
                "received_at": e.received_at.isoformat() if e.received_at else None,
            }
            for e in emails
        ],
        "error": None,
        "status": 200,
    }
