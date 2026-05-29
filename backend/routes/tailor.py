"""
Resume tailoring routes.

POST /api/tailor/custom                 — generate from a pasted JD (no DB job needed)
GET  /api/tailor/custom/{key}/resume    — download resume
GET  /api/tailor/custom/{key}/cover     — download cover letter

POST /api/tailor/{job_id}               — generate tailored resume + cover letter from DB job
GET  /api/tailor/{job_id}/resume        — download resume as .docx
GET  /api/tailor/{job_id}/cover         — download cover letter as .docx

NOTE: /custom routes MUST be registered before /{job_id} routes.
FastAPI matches paths in declaration order; without this, "custom" gets
matched as the job_id path segment and fails int validation with 422.
"""

import uuid
import logging
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from database import get_db
from models import Job, Profile

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tailor", tags=["tailor"])

# Simple in-memory cache keyed by "{job_id}:{method}" or "custom:{uuid}:{method}"
_cache: dict = {}


class TailorRequest(BaseModel):
    method: str                          # "llm" | "agent"
    extra_instructions: Optional[str] = ""
    generate_cover_letter: bool = False


class CustomTailorRequest(BaseModel):
    method: str                          # "llm" | "agent"
    company_name: Optional[str] = "Company"
    job_description: str
    extra_instructions: Optional[str] = ""
    generate_cover_letter: bool = False


# ── Custom JD routes (MUST be before /{job_id}) ───────────────────────────────

@router.post("/custom")
async def tailor_custom(req: CustomTailorRequest, db: Session = Depends(get_db)):
    if req.method not in ("llm", "agent"):
        raise HTTPException(status_code=400, detail="method must be 'llm' or 'agent'")
    if not req.job_description or len(req.job_description.strip()) < 50:
        raise HTTPException(status_code=400, detail="job_description too short (paste the full JD)")

    profile = db.query(Profile).first()

    jd_parts = [
        f"Company: {req.company_name}",
        f"\nJob Description:\n{req.job_description.strip()[:5000]}",
    ]
    resume_text = profile.resume_text if profile and profile.resume_text else ""
    jd = "\n".join(jd_parts)

    try:
        from services.resume_tailor import tailor_with_llm, tailor_with_agent

        if req.method == "agent":
            result = await tailor_with_agent(
                jd,
                resume_text,
                req.extra_instructions or "",
                req.generate_cover_letter,
            )
        else:
            result = await tailor_with_llm(
                jd,
                resume_text,
                req.extra_instructions or "",
                req.generate_cover_letter,
            )

        cache_key = str(uuid.uuid4())[:8]
        _cache[f"custom:{cache_key}:{req.method}"] = {
            "result":  result,
            "company": req.company_name or "Company",
        }

        return {
            "data": {
                "tailored_summary":  result.get("tailored_summary", ""),
                "cover_letter":      result.get("cover_letter", ""),
                "keywords_matched":  result.get("keywords_matched", []),
                "method":            req.method,
            },
            "cache_key": cache_key,
            "error":  None,
            "status": 200,
        }

    except Exception as e:
        logger.error(f"Custom tailor failed [{req.method}]: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/custom/{cache_key}/resume")
async def download_custom_resume(cache_key: str, method: str = "llm"):
    cached = _cache.get(f"custom:{cache_key}:{method}")
    if not cached:
        raise HTTPException(status_code=404, detail="No tailored resume found. Generate first.")

    from services.docx_generator import generate_resume_docx

    company  = cached["company"].replace(" ", "_").replace("/", "_")[:40]
    filename = f"Deepak_Satuluri_{company}.docx"
    content  = generate_resume_docx(cached["result"], company)

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/custom/{cache_key}/cover")
async def download_custom_cover(cache_key: str, method: str = "llm"):
    cached = _cache.get(f"custom:{cache_key}:{method}")
    if not cached:
        raise HTTPException(status_code=404, detail="No cover letter found. Generate first.")

    from services.docx_generator import generate_cover_letter_docx

    company  = cached["company"].replace(" ", "_").replace("/", "_")[:40]
    filename = f"Deepak_Satuluri_{company}_Cover_Letter.docx"
    content  = generate_cover_letter_docx(cached["result"].get("cover_letter", ""), company)

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── DB job routes (/{job_id} MUST come after /custom) ─────────────────────────

@router.post("/{job_id}")
async def tailor_resume(
    job_id: int,
    req: TailorRequest,
    db: Session = Depends(get_db),
):
    if req.method not in ("llm", "agent"):
        raise HTTPException(status_code=400, detail="method must be 'llm' or 'agent'")

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    profile = db.query(Profile).first()

    jd_parts = [f"Role: {job.title}", f"Company: {job.company_name}"]
    if job.location:
        jd_parts.append(f"Location: {job.location}")
    if job.description:
        jd_parts.append(f"\nJob Description:\n{job.description[:4000]}")
    resume_text = profile.resume_text if profile and profile.resume_text else ""
    jd = "\n".join(jd_parts)

    try:
        from services.resume_tailor import tailor_with_llm, tailor_with_agent

        if req.method == "agent":
            result = await tailor_with_agent(
                jd,
                resume_text,
                req.extra_instructions or "",
                req.generate_cover_letter,
            )
        else:
            result = await tailor_with_llm(
                jd,
                resume_text,
                req.extra_instructions or "",
                req.generate_cover_letter,
            )

        _cache[f"{job_id}:{req.method}"] = {
            "result":  result,
            "company": job.company_name,
        }

        return {
            "data": {
                "tailored_summary":  result.get("tailored_summary", ""),
                "cover_letter":      result.get("cover_letter", ""),
                "keywords_matched":  result.get("keywords_matched", []),
                "method":            req.method,
            },
            "error":  None,
            "status": 200,
        }

    except Exception as e:
        logger.error(f"Tailor failed [{req.method}] job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{job_id}/resume")
async def download_resume(job_id: int, method: str = "llm"):
    cached = _cache.get(f"{job_id}:{method}")
    if not cached:
        raise HTTPException(
            status_code=404,
            detail="No tailored resume found. Click 'Generate' first.",
        )

    from services.docx_generator import generate_resume_docx

    company  = cached["company"].replace(" ", "_").replace("/", "_")[:40]
    filename = f"Deepak_Satuluri_{company}.docx"
    content  = generate_resume_docx(cached["result"], company)

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{job_id}/cover")
async def download_cover_letter(job_id: int, method: str = "llm"):
    cached = _cache.get(f"{job_id}:{method}")
    if not cached:
        raise HTTPException(
            status_code=404,
            detail="No cover letter found. Click 'Generate' first.",
        )

    from services.docx_generator import generate_cover_letter_docx

    company  = cached["company"].replace(" ", "_").replace("/", "_")[:40]
    filename = f"Deepak_Satuluri_{company}_Cover_Letter.docx"
    content  = generate_cover_letter_docx(
        cached["result"].get("cover_letter", ""), company
    )

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
