import io
import os
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db
from models import Profile
import llm_service

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
            "resume_filename": profile.resume_filename,
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

    # Extract text from PDF
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

    # Parse resume with LLM
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
        db.flush()  # get ID before saving file

    # Save PDF file to disk so it can be downloaded later
    os.makedirs("uploads", exist_ok=True)
    file_path = f"uploads/resume_{profile.id}.pdf"
    with open(file_path, "wb") as f:
        f.write(content)

    # Update profile
    profile.resume_raw = raw_text
    profile.resume_filename = file.filename
    profile.resume_file_path = file_path

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
            "filename": file.filename,
        },
        "error": None,
        "status": 200,
    }


@router.get("/profile/resume/download")
async def download_resume(db: Session = Depends(get_db)):
    """Serve the saved resume PDF for viewing/downloading."""
    profile = db.query(Profile).first()
    if not profile or not profile.resume_file_path:
        raise HTTPException(status_code=404, detail="No resume on file")
    if not os.path.exists(profile.resume_file_path):
        raise HTTPException(status_code=404, detail="Resume file not found on disk")

    return FileResponse(
        profile.resume_file_path,
        media_type="application/pdf",
        filename=profile.resume_filename or "resume.pdf",
    )
