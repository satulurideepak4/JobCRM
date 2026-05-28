from typing import List, Dict, Optional
import llm_service


# ── Stage 1: Local keyword filter ─────────────────────────────────────────────

def local_filter(jobs: List[Dict], profile: Dict) -> List[Dict]:
    """
    Fast local filter before any LLM calls.

    Scoring:
      Must-have (3 pts each):
        - Job title contains the target role word
        - Description/tags contain a primary skill (first 5 skills)

      Good-to-have (2 pts each):
        - Description contains a secondary skill (skills 6-15)
        - Remote preference matched

      Nice-to-have (1 pt each):
        - Salary mentioned
        - Company website present
        - Tags overlap with skills

    Hard gate: must match role OR primary skill.
    Minimum to pass: 5 points — requires at least TWO positive signals,
    preventing pure title-only or single-skill-only false positives.
    """
    role = profile.get("role", "").lower()
    skills = [s.lower() for s in (profile.get("skills") or [])]
    primary_skills = skills[:5]
    secondary_skills = skills[5:15]
    remote_pref = profile.get("preferences", {}).get("remote_only", False)

    stop_words = {"and", "or", "the", "for", "with", "from", "senior", "junior",
                  "lead", "staff", "principal", "associate"}
    role_keywords = [w for w in role.split() if len(w) > 2 and w not in stop_words]
    if not role_keywords and role:
        role_keywords = [role]

    results = []
    for job in jobs:
        title = (job.get("title") or "").lower()
        desc = (job.get("description") or "").lower()
        location = (job.get("location") or "").lower()
        tags = [t.lower() for t in (job.get("tags") or [])]
        combined = f"{title} {desc} {' '.join(tags)}"

        score = 0
        reasons = []

        # Must-have checks
        role_match = any(kw in title for kw in role_keywords)
        if role_match:
            score += 3
            reasons.append("title_match")

        primary_match = [s for s in primary_skills if s in combined]
        if primary_match:
            score += 3
            reasons.append(f"skills:{','.join(primary_match[:2])}")

        # Hard gate: discard if neither role nor primary skill matched
        if not role_match and not primary_match:
            continue

        # Good-to-have
        secondary_match = [s for s in secondary_skills if s in combined]
        if secondary_match:
            score += 2
            reasons.append(f"secondary:{','.join(secondary_match[:2])}")

        is_remote = "remote" in location or "remote" in combined
        if remote_pref and not is_remote:
            score -= 2
        elif remote_pref and is_remote:
            score += 2
            reasons.append("remote")

        # Nice-to-have
        if job.get("salary_range"):
            score += 1
            reasons.append("has_salary")

        if job.get("company_website"):
            score += 1

        tag_overlap = [t for t in tags if any(s in t for s in primary_skills)]
        if tag_overlap:
            score += 1
            reasons.append("tag_match")

        # Require at least 2 positive signals (min 5 points)
        if score >= 5:
            job_copy = dict(job)
            job_copy["local_score"] = score
            job_copy["local_reasons"] = reasons
            job_copy["match_score"] = 0
            job_copy["match_reasons"] = []
            job_copy["ai_scored"] = False
            results.append(job_copy)

    results.sort(key=lambda x: x["local_score"], reverse=True)
    return results


# ── Stage 2: LLM batch scoring ────────────────────────────────────────────────

async def score_jobs_batch_llm(
    job_ids: List[int],
    profile: Dict,
    resume_text: Optional[str] = None,
) -> Dict[int, Dict]:
    """
    Score a list of job IDs using LLM.
    Sends 20 jobs per LLM call for efficiency.
    resume_text: the full extracted resume text (optional but greatly improves quality).
    Returns dict of {job_id: {score, reasons, tags, is_remote}}.
    """
    import asyncio
    from database import SessionLocal
    from models import Job

    db = SessionLocal()
    try:
        jobs = db.query(Job).filter(Job.id.in_(job_ids)).all()
    finally:
        db.close()

    job_map = {j.id: j for j in jobs}
    results = {}

    batch_size = 20
    job_list = list(job_map.values())

    for i in range(0, len(job_list), batch_size):
        batch = job_list[i:i + batch_size]
        scores = await _score_batch(batch, profile, resume_text)
        results.update(scores)

    return results


async def _score_batch(
    jobs,
    profile: Dict,
    resume_text: Optional[str] = None,
) -> Dict[int, Dict]:
    """Send up to 20 jobs to the LLM and parse scores."""
    import json

    # Build a rich profile context — use resume if available
    resume_section = ""
    if resume_text and len(resume_text.strip()) > 50:
        resume_section = f"\nRESUME SUMMARY (use this for deep matching):\n{resume_text[:2000]}\n"

    profile_context = (
        f"Role Seeking: {profile.get('role')}\n"
        f"Skills: {', '.join(profile.get('skills', []))}\n"
        f"Experience: {profile.get('experience_years', 0)} years\n"
        f"Preferences: {profile.get('preferences', {})}"
        f"{resume_section}"
    )

    job_lines = []
    for idx, job in enumerate(jobs):
        desc = (job.description or "")[:1500]
        tags_str = ", ".join(job.tags or [])
        job_lines.append(
            f"--- JOB {idx + 1} ---\n"
            f"ID: {job.id}\n"
            f"Title: {job.title}\n"
            f"Company: {job.company_name}\n"
            f"Location: {job.location}\n"
            f"Tags: {tags_str}\n"
            f"Description: {desc}\n"
        )

    jobs_text = "\n".join(job_lines)

    prompt = f"""You are a job-match evaluator. Score each job listing for this specific candidate.

CANDIDATE PROFILE:
{profile_context}

SCORING RUBRIC:
- 85-100: Excellent. Role matches exactly, most required skills present, remote-friendly or matches location pref
- 70-84:  Strong. Role is close, 3+ key skills match, reasonable fit
- 50-69:  Decent. Role adjacent, 2+ skills overlap, worth considering
- 30-49:  Weak. Minimal overlap — different domain or role mismatch
- 0-29:   Poor. Wrong domain, missing critical skills

JOBS:
{jobs_text}

Reply ONLY as a JSON array with one entry per job IN THE SAME ORDER:
[{{"id": <job_id>, "score": <0-100>, "reasons": ["<specific reason mentioning actual skills/role>", "<another>"], "tags": ["<skill tag>"], "is_remote": <bool>}}]

Rules:
- reasons must be SPECIFIC (e.g. "requires Python and FastAPI which candidate has" not "good match")
- Penalise hard if job requires skills the candidate clearly lacks
- Check if the role level (junior/senior/staff) fits the candidate's experience
- is_remote: true only if job is actually fully remote, not just "remote friendly" """

    try:
        result = await llm_service.generate(prompt)
        if isinstance(result, list):
            return {
                item["id"]: {
                    "score": int(item.get("score", 0)),
                    "reasons": item.get("reasons", []),
                    "tags": item.get("tags", []),
                    "is_remote": bool(item.get("is_remote", False)),
                }
                for item in result
                if "id" in item
            }
        if isinstance(result, dict):
            for v in result.values():
                if isinstance(v, list):
                    return {
                        item["id"]: {
                            "score": int(item.get("score", 0)),
                            "reasons": item.get("reasons", []),
                            "tags": item.get("tags", []),
                            "is_remote": bool(item.get("is_remote", False)),
                        }
                        for item in v
                        if "id" in item
                    }
    except Exception as e:
        print(f"Batch scoring error: {e}")

    return {}
