"""
Local semantic embedder for job-profile matching.

Uses sentence-transformers (all-MiniLM-L6-v2) — an 80MB neural network that
runs entirely on your CPU with no API calls, no internet, no cost after the
first download.

How it works:
  1. Your profile → 384 numbers (a vector capturing your professional identity)
  2. Each job description → 384 numbers (a vector capturing what the job wants)
  3. Cosine similarity between the two → a score 0–100 (how close the meanings are)

A score of 75+ means semantically very similar.
A score of 40 means very different domain.

This replaces LLM batch scoring for ranking relevance — the LLM is overkill
for "how similar are these two texts." Embeddings are the right tool.
"""

import logging
import numpy as np
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Module-level model cache — loaded once, reused forever (takes ~2s first time)
_model = None
_model_name = "all-MiniLM-L6-v2"


def _get_model():
    """Lazy-load the embedding model. Downloads ~80MB on first run, then cached."""
    global _model
    if _model is None:
        logger.info(f"Loading embedding model '{_model_name}' (one-time, ~2s)...")
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(_model_name)
        logger.info("Embedding model ready.")
    return _model


# ── Profile text builder ───────────────────────────────────────────────────────

def _build_profile_text(profile: Dict, resume_text: Optional[str] = None) -> str:
    """
    Convert the user's profile dict into a rich text string for embedding.
    Role and top skills are repeated to boost their weight in the vector space —
    embedding models treat frequency as importance.
    """
    role = profile.get("role") or ""
    skills = profile.get("skills") or []
    experience = profile.get("experience_years") or 0
    prefs = profile.get("preferences") or {}

    parts = []

    # Repeat role 3× so it dominates the embedding
    if role:
        parts.append(f"{role}. {role}. {role}.")

    # Top 5 skills repeated twice — high signal
    top_skills = skills[:5]
    if top_skills:
        skill_str = ", ".join(top_skills)
        parts.append(f"Core skills: {skill_str}.")
        parts.append(f"Expert in: {skill_str}.")

    # Remaining skills once
    if len(skills) > 5:
        parts.append(f"Also knows: {', '.join(skills[5:20])}.")

    if experience:
        parts.append(f"{experience} years of software engineering experience.")

    if prefs.get("remote_only"):
        parts.append("Fully remote only.")

    if prefs.get("job_type"):
        parts.append(f"Job type: {prefs['job_type']}.")

    # Resume text for richer context (first 800 chars)
    if resume_text and resume_text.strip():
        trimmed = resume_text.strip()[:800]
        parts.append(f"Background: {trimmed}")

    return " ".join(parts) if parts else f"Software engineer seeking {role or 'a technical role'}."


# ── Job text builder ───────────────────────────────────────────────────────────

def _strip_html(text: str) -> str:
    import re, html as html_mod
    text = html_mod.unescape(text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _build_job_text(job: Dict) -> str:
    """
    Convert a job dict into a text string for embedding.
    Title is repeated 3× — it's the most signal-dense field and should dominate
    the vector. Description is HTML-stripped so tags don't pollute the vector.
    """
    title = job.get("title") or ""
    company = job.get("company_name") or ""
    tags = job.get("tags") or []
    description = _strip_html((job.get("description") or ""))[:800]

    parts = []
    # Repeat title 3× so it anchors the job vector
    if title:
        parts.append(f"{title}. {title}. {title}.")
    if company:
        parts.append(f"Company: {company}.")
    if tags:
        tag_str = ", ".join(str(t) for t in tags[:10])
        parts.append(f"Required skills: {tag_str}.")
    if description:
        parts.append(description)

    return " ".join(parts) if parts else title


# ── Core embedding functions ──────────────────────────────────────────────────

def embed_profile(profile: Dict, resume_text: Optional[str] = None) -> np.ndarray:
    """
    Embed the user's profile into a normalised 384-dim vector.
    Call this once per search session and cache the result.
    """
    model = _get_model()
    text = _build_profile_text(profile, resume_text)
    logger.debug(f"Embedding profile: {text[:120]}...")
    vector = model.encode(text, normalize_embeddings=True)
    return vector  # shape: (384,)


def embed_jobs_batch(jobs: List[Dict]) -> np.ndarray:
    """
    Embed a list of job dicts in one efficient batch.
    Returns an (N × 384) matrix — one row per job.
    """
    if not jobs:
        return np.array([])

    model = _get_model()
    texts = [_build_job_text(j) for j in jobs]

    # batch_size=64 is a good balance for CPU — processes 64 jobs at once
    vectors = model.encode(
        texts,
        normalize_embeddings=True,
        batch_size=64,
        show_progress_bar=False,
    )
    return vectors  # shape: (N, 384)


# ── Scoring ───────────────────────────────────────────────────────────────────

def score_jobs(
    profile_vector: np.ndarray,
    job_vectors: np.ndarray,
) -> List[float]:
    """
    Compute cosine similarity between the profile vector and each job vector.
    Since both are L2-normalised, cosine similarity = dot product.

    Returns a list of floats in range [0, 100].
    """
    if job_vectors.ndim == 1:
        job_vectors = job_vectors.reshape(1, -1)

    # Matrix multiply: each row of job_vectors dotted with profile_vector
    # Result shape: (N,) — one similarity per job
    similarities = job_vectors @ profile_vector          # range: -1 .. 1
    scores = ((similarities + 1) / 2 * 100).tolist()     # rescale to 0..100
    return scores


# ── Domain penalty ────────────────────────────────────────────────────────────
# Secondary safety net after scorer.py's blocklist.
# Applies a soft score multiplier when a job title has domain words absent from profile.

_DOMAIN_INDICATORS = {
    "cad", "mechanical", "embedded", "firmware", "fpga", "verilog", "vhdl",
    "asic", "rtl", "pcb", "electrical", "civil", "structural", "aerospace",
    "automotive", "plc", "scada", "solidworks", "catia", "robotics",
    "blockchain", "solidity", "nft", "web3", "defi",
    "sap", "cobol", "mainframe",
    "clinical", "pharmaceutical", "biotech", "genomics",
}


_JUNIOR_SIGNALS = {"junior", "entry", "entry-level", "intern", "internship", "graduate", "jr.", "jr,", "associate"}
_SENIOR_SIGNALS = {"senior", "staff", "principal", "lead", "architect", "head", "director", "vp", "manager"}


def _domain_penalty(job: Dict, profile_text_lower: str) -> float:
    """
    Returns 1.0 (no penalty) if title domain matches profile,
    or 0.4–0.7 if domain-specific words in the title are absent from the profile.
    """
    title_words = set((job.get("title") or "").lower().split())
    mismatched = [w for w in _DOMAIN_INDICATORS if w in title_words and w not in profile_text_lower]
    if not mismatched:
        return 1.0
    return max(0.4, 1.0 - 0.35 * len(mismatched))


def _seniority_penalty(job: Dict, experience_years: int) -> float:
    """
    Penalise seniority mismatches:
    - Junior role + 3+ years experience → 0.6 (probably a waste of time)
    - Director/VP role + <6 years experience → 0.7 (likely a reach)
    """
    title_lower = (job.get("title") or "").lower()
    title_words = set(title_lower.split())

    is_junior = any(w in title_lower for w in _JUNIOR_SIGNALS)
    is_very_senior = any(w in title_words for w in {"director", "vp", "head", "architect"})

    if is_junior and experience_years >= 3:
        return 0.6
    if is_very_senior and experience_years < 6:
        return 0.7
    return 1.0


# ── Main entry point ──────────────────────────────────────────────────────────

def rank_jobs_by_relevance(
    jobs: List[Dict],
    profile: Dict,
    resume_text: Optional[str] = None,
    top_n: int = 100,
    min_score: float = 62.0,
) -> List[Tuple[Dict, float]]:
    """
    Return the top_n most relevant jobs sorted by descending semantic similarity.
    Applies a domain-mismatch penalty before filtering by min_score.
    """
    if not jobs:
        return []

    logger.info(f"Embedding {len(jobs)} jobs for semantic ranking...")

    profile_vector = embed_profile(profile, resume_text)
    profile_text_lower = _build_profile_text(profile, resume_text).lower()
    job_vectors = embed_jobs_batch(jobs)

    if job_vectors.size == 0:
        return []

    raw_scores = score_jobs(profile_vector, job_vectors)
    experience_years = profile.get("experience_years") or 0

    # Apply domain + seniority penalties, then filter
    scored = []
    for job, raw in zip(jobs, raw_scores):
        adjusted = raw * _domain_penalty(job, profile_text_lower) * _seniority_penalty(job, experience_years)
        if adjusted >= min_score:
            scored.append((job, adjusted))

    scored.sort(key=lambda x: x[1], reverse=True)

    if scored:
        logger.info(
            f"Embedding done: {len(scored)}/{len(jobs)} jobs passed min_score={min_score}. "
            f"Top score: {scored[0][1]:.1f}"
        )
    else:
        logger.info(f"Embedding done: 0/{len(jobs)} jobs passed threshold.")

    return scored[:top_n]
