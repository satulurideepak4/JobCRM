from typing import List, Dict, Optional
import llm_service
from services.date_utils import extract_skill_keywords


# ── Domain mismatch blocklist ─────────────────────────────────────────────────
_DOMAIN_TITLE_BLOCKLIST = {
    "cad", "mechanical", "embedded", "firmware", "fpga", "verilog", "vhdl",
    "asic", "rtl", "pcb", "electrical", "civil", "structural", "aerospace",
    "automotive", "plc", "scada", "solidworks", "catia", "ansys", "autocad",
    "robotics", "mechatronics", "cnc",
    "blockchain", "solidity", "nft", "web3", "defi",
    "sap", "cobol", "mainframe", "abap",
    "clinical", "pharmaceutical", "biotech", "genomics", "bioinformatics",
}

_CUSTOMER_FACING_TITLE_WORDS = {
    "solutions", "presales", "pre-sales", "advocate",
    "evangelist", "devrel", "success",
}

_CUSTOMER_FACING_PHRASES = {
    "professional services",
    "technical services",
    "technical support",
    "customer support",
    "sales engineer",
    "field engineer",
    "technical account",
}

_MANAGEMENT_TITLE_WORDS = {"manager", "director", "vp", "vice president", "head of"}


# ── Weighted synonym groups for broad matching ────────────────────────────────
# Each group: (weight, [synonyms...])
# Iterate all groups; if ANY synonym found in lowercased (title+desc), add weight.
# Job passes prefilter if total weighted_score >= PREFILTER_THRESHOLD.
SKILL_GROUPS = {
    "kafka":          (3, ["kafka", "event streaming", "event-driven", "message broker",
                           "pub-sub", "apache kafka", "confluent", "kinesis", "rabbitmq", "amqp"]),
    "java_go":        (3, ["java", "golang", "go lang", "go backend", "jvm", "kotlin"]),
    "spring_boot":    (2, ["spring boot", "spring framework", "springboot", "spring mvc", "spring cloud"]),
    "api_platform":   (2, ["api gateway", "api platform", "api management", "rest api",
                           "graphql", "openapi", "grpc", "api tooling"]),
    "distributed":    (2, ["distributed systems", "microservices", "service mesh",
                           "high availability", "fault tolerant", "scalable", "high throughput"]),
    "data_infra":     (2, ["data pipeline", "data platform", "streaming", "real-time",
                           "etl", "data infra"]),
    "cloud":          (1, ["aws", "gcp", "azure", "cloud native", "kubernetes", "k8s",
                           "docker", "terraform"]),
    "postgres_redis": (1, ["postgresql", "postgres", "redis", "mongodb", "nosql", "relational"]),
    "fintech":        (1, ["fintech", "payments", "banking", "financial", "transactions", "ledger"]),
    "remote_signal":  (1, ["remote", "remote-first", "async", "distributed team", "work from anywhere"]),
}

PREFILTER_THRESHOLD = 4

# Hard reject — any of these in (title+desc).lower() → immediate discard
HARD_REJECT_TERMS = [
    "node.js only", "ruby on rails", ".net only", "php only",
    "on-site", "onsite required", "no remote", "in-office",
    "staffing", "consulting firm", "outsourcing", "body shop",
    "10+ years", "8+ years", "7+ years",
]


# ── Stage 1: Local keyword filter ─────────────────────────────────────────────

def local_filter(jobs: List[Dict], profile: Dict) -> List[Dict]:
    """
    Fast local prefilter using weighted synonym groups.

    1. Hard-reject any job containing HARD_REJECT_TERMS.
    2. Compute weighted score by checking SKILL_GROUPS synonyms against
       (title + description).lower().
    3. Keep jobs with weighted_score >= PREFILTER_THRESHOLD (=4).

    Also applies domain / customer-facing / management title guards.
    """
    role = profile.get("role", "").lower()
    raw_skills = profile.get("skills") or []
    profile_combined = f"{role} {' '.join(s.lower() for s in raw_skills)}"

    results = []
    for job in jobs:
        title = (job.get("title") or "").lower()
        desc  = (job.get("description") or "").lower()
        combined = f"{title} {desc[:1000]}"

        # ── Hard reject check ─────────────────────────────────────────────────
        if any(term in combined for term in HARD_REJECT_TERMS):
            continue

        # ── Domain mismatch guard ─────────────────────────────────────────────
        domain_hit = next(
            (w for w in _DOMAIN_TITLE_BLOCKLIST if w in title and w not in profile_combined),
            None,
        )
        if domain_hit:
            continue

        # ── Customer-facing / non-IC guard ────────────────────────────────────
        title_cf = {w for w in _CUSTOMER_FACING_TITLE_WORDS if w in title}
        if title_cf and not any(w in profile_combined for w in title_cf):
            continue
        if any(p in title for p in _CUSTOMER_FACING_PHRASES):
            if not any(p in profile_combined for p in _CUSTOMER_FACING_PHRASES):
                continue
        if any(w in title for w in _MANAGEMENT_TITLE_WORDS):
            if not any(w in profile_combined for w in _MANAGEMENT_TITLE_WORDS):
                continue

        # ── Weighted synonym scoring ──────────────────────────────────────────
        weighted_score = 0
        matched_groups = []
        for group_name, (weight, synonyms) in SKILL_GROUPS.items():
            if any(syn in combined for syn in synonyms):
                weighted_score += weight
                matched_groups.append(group_name)

        if weighted_score < PREFILTER_THRESHOLD:
            continue

        job_copy = dict(job)
        job_copy["local_score"]   = weighted_score
        job_copy["local_reasons"] = matched_groups
        job_copy["match_score"]   = 0
        job_copy["match_reasons"] = []
        job_copy["ai_scored"]     = False
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
    Score a list of job IDs using the LLM.
    Sends up to 10 jobs per call. Returns {job_id: {score, reason, red_flags, apply_method}}.
    Scores are on a 1-10 scale (multiplied by 10 before storage → 10-100 in DB).
    """
    import asyncio
    from database import SessionLocal
    from models import Job

    db = SessionLocal()
    try:
        jobs = db.query(Job).filter(Job.id.in_(job_ids)).all()
    finally:
        db.close()

    job_map  = {j.id: j for j in jobs}
    results  = {}
    batch_size = 10
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
    """Score up to 10 jobs with the LLM. Returns {job_id: scoring_dict}."""
    import json

    job_lines = []
    for idx, job in enumerate(jobs):
        desc     = (job.description or "")[:800]
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

    user_msg = (
        f"Score each of the following {len(jobs)} jobs. "
        f"Return a JSON ARRAY, one object per job in the exact order listed:\n"
        f'[{{"id": <job_id>, "score": <1-10>, "reason": "<one sentence>", '
        f'"red_flags": ["<flag>"], "apply_method": "direct|cold_email"}}]\n\n'
        f"{jobs_text}"
    )

    system_prompt = llm_service.build_scoring_system_prompt(profile, resume_text)

    try:
        result = await llm_service.generate(user_msg, system=system_prompt)
        if isinstance(result, list):
            return {
                item["id"]: {
                    "score":        min(100, int(item.get("score", 0)) * 10),
                    "reasons":      [item.get("reason", "")] if item.get("reason") else [],
                    "red_flags":    item.get("red_flags", []),
                    "apply_method": item.get("apply_method", "direct"),
                    "is_remote":    True,
                }
                for item in result
                if "id" in item
            }
        # Fallback: dict wrapping array
        if isinstance(result, dict):
            for v in result.values():
                if isinstance(v, list):
                    return {
                        item["id"]: {
                            "score":        min(100, int(item.get("score", 0)) * 10),
                            "reasons":      [item.get("reason", "")] if item.get("reason") else [],
                            "red_flags":    item.get("red_flags", []),
                            "apply_method": item.get("apply_method", "direct"),
                            "is_remote":    True,
                        }
                        for item in v
                        if "id" in item
                    }
    except Exception as e:
        print(f"Batch scoring error: {e}")

    return {}
