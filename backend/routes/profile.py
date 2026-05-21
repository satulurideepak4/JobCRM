import io
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Profile
import llm_service
import os

router = APIRouter(tags=["profile"])


@router.get("/profile")
async def get_profile(db: Session = Depends(get_db)):
    profile = db.query(Profile).first()
    if not profile:
        return {"data": None, "error": None, "status": 200}
    return {
        "data": {
            "id": profile.id,
            "name": profile.name,
            "role": profile.role,
            "skills": profile.skills or [],
            "experience_years": profile.experience_years,
            "preferences": profile.preferences or {},
            "has_resume": bool(profile.resume_text),
            "llm_provider": os.getenv("LLM_PROVIDER", "gemini"),
        },
        "error": None,
        "status": 200,
    }


@router.post("/profile")
async def create_or_update_profile(body: dict, db: Session = Depends(get_db)):
    profile = db.query(Profile).first()
    if not profile:
        profile = Profile()
        db.add(profile)

    if "name" in body:
        profile.name = body["name"]
    if "role" in body:
        profile.role = body["role"]
    if "skills" in body:
        profile.skills = body["skills"]
    if "experience_years" in body:
        profile.experience_years = body["experience_years"]
    if "preferences" in body:
        profile.preferences = body["preferences"]

    db.commit()
    db.refresh(profile)
    return {"data": {"id": profile.id}, "error": None, "status": 200}


@router.post("/profile/resume")
async def upload_resume(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    content = await file.read()

    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(io.BytesIO(content))
        raw_text = ""
        for page in reader.pages:
            raw_text += page.extract_text() or ""
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {e}")

    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")

    prompt = f"""Parse this resume and extract structured information.
Reply only in JSON: {{"name": <str>, "role": <str>, "skills": [<str>], "experience_years": <int>, "summary": <str>}}

Resume text:
{raw_text[:4000]}"""

    try:
        parsed = await llm_service.generate(prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM parsing failed: {e}")

    profile = db.query(Profile).first()
    if not profile:
        profile = Profile()
        db.add(profile)

    profile.resume_raw = raw_text
    if isinstance(parsed, dict):
        profile.resume_text = parsed.get("summary", raw_text[:500])
        if parsed.get("name"):
            profile.name = parsed["name"]
        if parsed.get("role"):
            profile.role = parsed["role"]
        if parsed.get("skills"):
            profile.skills = parsed["skills"]
        if parsed.get("experience_years") is not None:
            profile.experience_years = parsed["experience_years"]

    db.commit()
    return {
        "data": {
            "parsed": parsed if isinstance(parsed, dict) else {},
            "raw_length": len(raw_text),
        },
        "error": None,
        "status": 200,
    }
