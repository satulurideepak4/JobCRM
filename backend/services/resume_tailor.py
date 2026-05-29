"""
Resume tailoring service — two paths:
  llm:   OpenAI GPT-4o via API (~$0.04/generation)
  agent: Claude Code CLI subprocess (uses Claude Pro subscription, free)
Both return the same structured dict for docx generation.
"""

import os
import json
import asyncio
import subprocess
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ── Candidate profile ─────────────────────────────────────────────────────────
_PROFILE = """
CANDIDATE: Deepak Satuluri — Senior Backend Engineer, 4 years experience.
Founding engineer at APIwiz (Gartner-recognized API management platform, $2M seed):
platform manages 25K+ APIs and 10B+ API calls globally; production customers include
EWB, RCBC, and Tonik banks (APAC/EMEA banking, telco, insurance).
Previously at Align Technology (healthcare SaaS).
Stack: Go, Java 17, Spring Boot, Python, Apache Kafka, RabbitMQ, Redis,
PostgreSQL, MongoDB, AWS S3, GCP Cloud Storage, Azure Blob, Docker, Kubernetes,
OAuth, JWT, AES/RSA, Prometheus, Grafana, React, TypeScript.

KEY METRICS (pick the most relevant per JD):
- Kafka pipelines: 50,000+ events/second, Grafana lag dashboards, alert-driven auto-recovery
- API response time: 10+ seconds → under 1 second (routing optimization + Caffeine/Redis/PG caching)
- Multi-cloud archival pipeline (AWS S3 + GCP + Azure Blob): cut storage costs 40%
- Native API Gateway: built from scratch, 22+ policy types
- Led Apigee-to-Kong migration for enterprise customers
- Zero-downtime Kubernetes deployments: rolling updates + health checks
- MongoDB N+1 fixes + schema optimization at Align Technology
- OSS contributor: Quarkus, Traefik

SIDE PROJECTS:
- RemoteScope: remote job aggregator, 13+ sources (Java, Kafka, Redis, PostgreSQL)
- Resume Screening Pipeline: AI candidate scoring via Gemini, async notifications via Kafka/RabbitMQ
- apiwiz-cli: kubectl-style CLI for API Gateway management (Go, Java 17, Picocli)

CONTACT:
Email: satulurideepak4@gmail.com | Phone: +91 7095918889 | Bengaluru, India
LinkedIn: https://linkedin.com/in/satuluri-deepak-69227a1a1
GitHub: https://github.com/satulurideepak4
Portfolio: https://satulurideepak4.github.io/satulurideepak4/
"""

_TAILORING_LOGIC = """
TAILORING BY JD SIGNAL:
- Go as primary language      → Move Go to front of skills; open summary with Go
- Java / Spring Boot focused  → Lead with APIwiz backend work and Spring Boot
- Data pipelines / streaming  → Lead with Kafka metrics; add Iceberg/ClickHouse if in JD
- API / platform / gateway    → Lead with API Builder, Gateway, Apigee-to-Kong migration
- Kubernetes / DevOps heavy   → Elevate zero-downtime deployment bullet
- OSS contributions valued    → Give OSS its own "Open Source" section
- Early-stage / startup       → Emphasize founding engineer angle and 0-to-1 ownership
- Healthcare / fintech        → Make Align Technology work more prominent
- Observability / monitoring  → Prometheus and Grafana lag dashboards front and center
- Cloud (AWS/GCP/Azure)       → Multi-cloud archival pipeline + 40% cost reduction metric
- Security focused            → OAuth, JWT, AES/RSA bullets prominent
- Database internals          → Query optimization, N+1 fixes, MongoDB schema work
"""

_HARD_RULES = """
HARD RULES — NEVER BREAK:
- NEVER use em dashes (—). Replace with colons, commas, semicolons, or rewrite.
- Every bullet must contain a real number or concrete outcome. No vague claims.
- The banking metric (EWB, RCBC, Tonik banks) MUST appear in Professional Summary. No exceptions.
- Do NOT list full stack in every bullet. Pick what is relevant to that specific JD.
- Python and Go are real skills. Include naturally when relevant. Never hedge or qualify.
- NEVER add skills Deepak does not have. Only reword real experience using JD vocabulary.
- Cover letter must NOT be generic. Reference specific requirements from the JD.
"""

_OUTPUT_SCHEMA_WITH_COVER = """
Return ONLY valid JSON. No text outside the JSON. Exact structure:
{
  "tailored_summary": "4-6 sentences. Must include banking metric (EWB, RCBC, Tonik banks).",
  "keywords_matched": ["keyword1", "keyword2"],
  "skills": [
    {"category": "Languages",       "items": ["Go", "Java 17", "Python"]},
    {"category": "Frameworks",      "items": ["Spring Boot", "Kafka", "RabbitMQ"]},
    {"category": "Cloud & Infra",   "items": ["AWS", "GCP", "Azure", "Kubernetes", "Docker"]},
    {"category": "Databases",       "items": ["PostgreSQL", "Redis", "MongoDB"]},
    {"category": "Observability",   "items": ["Prometheus", "Grafana"]},
    {"category": "Security",        "items": ["OAuth 2.0", "JWT", "AES/RSA"]}
  ],
  "experience": [
    {
      "company": "APIwiz",
      "role": "role title rewritten to match JD language",
      "period": "Jan 2022 - Present",
      "bullets": ["bullet with real metric", "bullet with real metric"]
    },
    {
      "company": "Align Technology",
      "role": "Software Engineer",
      "period": "Jun 2021 - Dec 2021",
      "bullets": ["bullet with real metric"]
    }
  ],
  "projects": [
    {
      "name": "project name",
      "tech": "tech stack",
      "bullets": ["what it does, with metric or outcome"]
    }
  ],
  "cover_letter": "3 paragraphs. Specific to the role and company. References JD requirements and maps to Deepak's experience. No em dashes."
}
"""

_OUTPUT_SCHEMA_NO_COVER = """
Return ONLY valid JSON. No text outside the JSON. Exact structure:
{
  "tailored_summary": "4-6 sentences. Must include banking metric (EWB, RCBC, Tonik banks).",
  "keywords_matched": ["keyword1", "keyword2"],
  "skills": [
    {"category": "Languages",       "items": ["Go", "Java 17", "Python"]},
    {"category": "Frameworks",      "items": ["Spring Boot", "Kafka", "RabbitMQ"]},
    {"category": "Cloud & Infra",   "items": ["AWS", "GCP", "Azure", "Kubernetes", "Docker"]},
    {"category": "Databases",       "items": ["PostgreSQL", "Redis", "MongoDB"]},
    {"category": "Observability",   "items": ["Prometheus", "Grafana"]},
    {"category": "Security",        "items": ["OAuth 2.0", "JWT", "AES/RSA"]}
  ],
  "experience": [
    {
      "company": "APIwiz",
      "role": "role title rewritten to match JD language",
      "period": "Jan 2022 - Present",
      "bullets": ["bullet with real metric", "bullet with real metric"]
    },
    {
      "company": "Align Technology",
      "role": "Software Engineer",
      "period": "Jun 2021 - Dec 2021",
      "bullets": ["bullet with real metric"]
    }
  ],
  "projects": [
    {
      "name": "project name",
      "tech": "tech stack",
      "bullets": ["what it does, with metric or outcome"]
    }
  ],
  "cover_letter": ""
}
"""


def _build_prompt(
    jd: str,
    original_resume_text: str = "",
    extra_instructions: str = "",
    generate_cover_letter: bool = False,
) -> str:
    extra = (
        f"\nADDITIONAL INSTRUCTIONS FROM CANDIDATE:\n{extra_instructions.strip()}\n"
        if extra_instructions.strip() else ""
    )
    schema = _OUTPUT_SCHEMA_WITH_COVER if generate_cover_letter else _OUTPUT_SCHEMA_NO_COVER
    cover_note = "" if generate_cover_letter else "\nDo NOT generate a cover letter. Set cover_letter to empty string.\n"
    resume_source = (
        f"\nORIGINAL RESUME (SOURCE OF TRUTH):\n{original_resume_text.strip()[:8000]}\n"
        if original_resume_text and original_resume_text.strip()
        else ""
    )
    tailoring_scope = """
TAILORING SCOPE (STRICT):
- Tailor from the ORIGINAL RESUME first, then align wording to the JD.
- Do not invent jobs, projects, dates, education, certifications, or tools not present in the original resume/profile.
- Preserve the resume structure used by the original resume template.
- Only rewrite relevant text content (summary + existing bullets) to match the JD.
- Do not expand layout by adding extra bullet rows/sections.
"""
    return (
        f"You are a precise resume tailoring assistant.\n\n"
        f"{_PROFILE}\n"
        f"{resume_source}\n"
        f"{_TAILORING_LOGIC}\n"
        f"{tailoring_scope}\n"
        f"{_HARD_RULES}\n"
        f"{cover_note}"
        f"{extra}\n"
        f"{schema}\n\n"
        f"JOB DESCRIPTION:\n{jd}\n\n"
        f"Tailor the resume for this JD and return JSON only."
    )


def _extract_json(text: str) -> dict:
    """Extract JSON object from LLM output that may contain surrounding text."""
    text = text.strip()
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Find first { ... last }
    start = text.find('{')
    end   = text.rfind('}') + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object found in response")
    return json.loads(text[start:end])


async def tailor_with_llm(
    jd: str,
    original_resume_text: str = "",
    extra_instructions: str = "",
    generate_cover_letter: bool = False,
) -> dict:
    """Tailor resume using OpenAI GPT-4o API."""
    from openai import AsyncOpenAI

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured in .env")

    client   = AsyncOpenAI(api_key=api_key)
    prompt   = _build_prompt(jd, original_resume_text, extra_instructions, generate_cover_letter)

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    return json.loads(response.choices[0].message.content)


async def tailor_with_agent(
    jd: str,
    original_resume_text: str = "",
    extra_instructions: str = "",
    generate_cover_letter: bool = False,
) -> dict:
    """Tailor resume using Claude Code CLI subprocess (Claude Pro subscription)."""
    prompt = _build_prompt(jd, original_resume_text, extra_instructions, generate_cover_letter)

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: subprocess.run(
                ["claude", "-p", prompt, "--output-format", "text"],
                capture_output=True,
                text=True,
                timeout=120,
            ),
        )
    except FileNotFoundError:
        raise RuntimeError(
            "Claude Code CLI not found. Install: npm install -g @anthropic-ai/claude-code"
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("Claude Code CLI timed out after 120 seconds")

    if result.returncode != 0:
        raise RuntimeError(f"Claude CLI error: {result.stderr[:500]}")

    return _extract_json(result.stdout)
