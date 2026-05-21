from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from database import get_db
from models import InterviewSession, Profile
from services.interview_service import (
    build_system_prompt, get_next_response, generate_debrief, MAX_QUESTIONS
)

router = APIRouter(prefix="/api/interview", tags=["interview"])


class StartRequest(BaseModel):
    mode: str  # "job", "concept", "both"
    jd_text: Optional[str] = None
    concept: Optional[str] = None
    job_id: Optional[int] = None
    total_questions: Optional[int] = 10


class RespondRequest(BaseModel):
    answer: str


@router.post("/start")
async def start_interview(req: StartRequest, db: Session = Depends(get_db)):
    profile = db.query(Profile).first()
    if not profile:
        raise HTTPException(status_code=400, detail="No profile found. Please create a profile first.")

    total_qs = min(req.total_questions or 10, 15)

    profile_dict = {
        "role": profile.role or "",
        "skills": profile.skills or [],
        "experience_years": profile.experience_years or 0,
        "preferences": profile.preferences or {},
        "total_questions": total_qs,
    }

    jd_text = req.jd_text or ""

    # If job_id provided, try to get JD from saved jobs
    if req.job_id and not jd_text:
        from models import Job
        job = db.query(Job).filter(Job.id == req.job_id).first()
        if job:
            jd_text = f"Title: {job.title}\nCompany: {job.company_name}\n\n{job.description or ''}"

    system_prompt = build_system_prompt(req.mode, jd_text, req.concept or "", profile_dict)

    # Opening message from interviewer
    opening_prompt = f"""{system_prompt}

Start the interview now. Greet the candidate warmly in one sentence, then ask your first interview question. Keep it under 3 sentences total. Plain text only, no markdown, no JSON."""

    import llm_service
    opening = await llm_service.generate(opening_prompt)
    if not isinstance(opening, str):
        opening = "Welcome! Let's get started. Can you begin by telling me a bit about yourself and what brings you to this role?"

    opening = opening.strip()

    conversation = [{"role": "assistant", "content": opening, "timestamp": datetime.utcnow().isoformat()}]

    session = InterviewSession(
        mode=req.mode,
        jd_text=jd_text,
        concept=req.concept,
        job_id=req.job_id,
        conversation=conversation,
        question_count=1,
        total_questions=total_qs,
        status="active",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "session_id": session.id,
        "question": opening,
        "question_number": 1,
        "total_questions": session.total_questions,
        "is_final": False,
    }


@router.post("/{session_id}/respond")
async def respond(session_id: int, req: RespondRequest, db: Session = Depends(get_db)):
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "completed":
        raise HTTPException(status_code=400, detail="Interview already completed")

    profile = db.query(Profile).first()
    profile_dict = {
        "role": profile.role if profile else "",
        "skills": profile.skills if profile else [],
        "experience_years": profile.experience_years if profile else 0,
        "total_questions": session.total_questions,
    }

    # Add user answer to conversation (reassign whole list to trigger SQLAlchemy change detection)
    conversation = list(session.conversation or [])
    conversation.append({
        "role": "user",
        "content": req.answer.strip(),
        "timestamp": datetime.utcnow().isoformat()
    })

    is_final = session.question_count >= session.total_questions

    if is_final:
        # Generate debrief
        debrief = await generate_debrief(conversation, profile_dict, session.jd_text or "", session.concept or "")
        closing = "That concludes our interview. Let me share your feedback now."
        conversation.append({
            "role": "assistant",
            "content": closing,
            "timestamp": datetime.utcnow().isoformat()
        })
        session.conversation = conversation
        flag_modified(session, "conversation")
        session.debrief = debrief
        session.status = "completed"
        session.completed_at = datetime.utcnow()
        db.commit()
        return {
            "is_final": True,
            "closing": closing,
            "debrief": debrief,
            "question_number": session.question_count,
            "total_questions": session.total_questions,
        }

    # Generate next question
    system_prompt = build_system_prompt(session.mode, session.jd_text or "", session.concept or "", profile_dict)
    next_q = await get_next_response(conversation, system_prompt)

    conversation.append({
        "role": "assistant",
        "content": next_q,
        "timestamp": datetime.utcnow().isoformat()
    })

    session.conversation = conversation
    flag_modified(session, "conversation")
    session.question_count = session.question_count + 1
    db.commit()

    return {
        "is_final": False,
        "question": next_q,
        "question_number": session.question_count,
        "total_questions": session.total_questions,
    }


@router.post("/{session_id}/end")
async def end_early(session_id: int, db: Session = Depends(get_db)):
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == "completed":
        return {"debrief": session.debrief}

    profile = db.query(Profile).first()
    profile_dict = {
        "role": profile.role if profile else "",
        "skills": profile.skills if profile else [],
        "experience_years": profile.experience_years if profile else 0,
        "total_questions": session.total_questions,
    }

    conversation = list(session.conversation or [])
    if len(conversation) > 2:
        debrief = await generate_debrief(conversation, profile_dict, session.jd_text or "", session.concept or "")
    else:
        debrief = "Interview ended early — not enough data for a full debrief."

    session.debrief = debrief
    session.status = "completed"
    session.completed_at = datetime.utcnow()
    db.commit()

    return {"debrief": debrief}


@router.get("/sessions")
def list_sessions(db: Session = Depends(get_db)):
    sessions = db.query(InterviewSession).order_by(InterviewSession.created_at.desc()).limit(20).all()
    return [
        {
            "id": s.id,
            "mode": s.mode,
            "concept": s.concept,
            "job_id": s.job_id,
            "status": s.status,
            "question_count": s.question_count,
            "total_questions": s.total_questions,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sessions
    ]


@router.get("/{session_id}")
def get_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": session.id,
        "mode": session.mode,
        "jd_text": session.jd_text,
        "concept": session.concept,
        "job_id": session.job_id,
        "conversation": session.conversation,
        "debrief": session.debrief,
        "status": session.status,
        "question_count": session.question_count,
        "total_questions": session.total_questions,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
    }
