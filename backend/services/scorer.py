from typing import List, Dict
import llm_service


# ── Stage 1: Local keyword filter ─────────────────────────────────────────────

def local_filter(jobs: List[Dict], profile: Dict) -> List[Dict]:
    """
    Fast local filter before any LLM calls.
    Scores each job on three tiers and returns jobs that clear a minimum bar.

    Must have (3 pts each):
      - Job title contains the target role word
      - Job description contains a primary skill (first 5 skills)

    Good to have (2 pts each):
      - Description contains a secondary skill (skills 6-15)
      - Job type matches preference (remote)

    Nice to have (1 pt each):
      - Salary mentioned in listing
      - Company website present
      - Tags overlap with skills

    Minimum to pass: at least 3 points (one must-have)
    Jobs are returned sorted by local_score descending.
    """
    role = profile.get("role", "").lower()
    skills = [s.lower() for s in (profile.get("skills") or [])]
    primary_skills = skills[:5]
    secondary_skills = skills[5:15]
    remote_pref = profile.get("preferences", {}).get("remote_only", False)

    # Extract meaningful role keywords — keep 3+ char words so short roles
    # like "ios", "sre", "dev" are included
    stop_words = {"and", "or", "the", "for", "with", "from", "senior", "junior", "lead", "staff"}
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

        # Must-have checks (3 pts each)
        role_match = any(kw in title for kw in role_keywords)
        if role_match:
            score += 3
            reasons.append("title_match")

        primary_match = [s for s in primary_skills if s in combined]
        if primary_match:
            score += 3
            reasons.append(f"skills:{','.join(primary_match[:2])}")

        # Hard gate: must match on role OR a primary skill — no freeloading
        # on secondary/salary signals alone
        if not role_match and not primary_match:
            continue

        # Good to have (2 pts each)
        secondary_match = [s for s in secondary_skills if s in combined]
        if secondary_match:
            score += 2
            reasons.append(f"secondary:{','.join(secondary_match[:2])}")

        is_remote = "remote" in location or "remote" in combined
        if remote_pref and not is_remote:
            # Penalise non-remote but don't hard-drop (user may still want it)
            score -= 2
        elif remote_pref and is_remote:
            score += 2
            reasons.append("remote")

        # Nice to have (1 pt each)
        if job.get("salary_range"):
            score += 1
            reasons.append("has_salary")

        if job.get("company_website"):
            score += 1

        tag_overlap = [t for t in tags if any(s in t for s in primary_skills)]
        if tag_overlap:
            score += 1
            reasons.append("tag_match")

        if score >= 3:
            job_copy = dict(job)
            job_copy["local_score"] = score
            job_copy["local_reasons"] = reasons
            job_copy["match_score"] = 0  # will be set by LLM later
            job_copy["match_reasons"] = []
            job_copy["ai_scored"] = False
            results.append(job_copy)

    results.sort(key=lambda x: x["local_score"], reverse=True)
    return results


# ── Stage 2: LLM batch scoring (user-triggered) ───────────────────────────────

async def score_jobs_batch_llm(job_ids: List[int], profile: Dict) -> Dict[int, Dict]:
    """
    Score a list of job IDs using LLM. Sends 20 jobs per LLM call.
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
        scores = await _score_batch(batch, profile)
        results.update(scores)

    return results


async def _score_batch(jobs, profile: Dict) -> Dict[int, Dict]:
    """Send up to 20 jobs in a single LLM call and parse scores for each."""
    import json

    job_lines = []
    for idx, job in enumerate(jobs):
        job_lines.append(
            f"{idx + 1}. ID={job.id} | Title: {job.title} | Company: {job.company_name} | "
            f"Location: {job.location} | Description: {(job.description or '')[:400]}"
        )

    jobs_text = "\n".join(job_lines)

    prompt = f"""Score each job against this profile.
Profile: role={profile.get('role')}, skills={profile.get('skills')}, experience={profile.get('experience_years')} years, preferences={profile.get('preferences')}.

Jobs:
{jobs_text}

Reply only in JSON as an array with one entry per job in the same order:
[{{"id": <job_id>, "score": <0-100>, "reasons": [<str>, <str>], "tags": [<str>], "is_remote": <bool>}}]"""

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
        # Sometimes returns dict with a key wrapping the array
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
