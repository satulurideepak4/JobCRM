import os
import json
import asyncio
from typing import Optional, Union
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from dotenv import load_dotenv

load_dotenv()

# ── Dynamic job-scoring system prompt ────────────────────────────────────────

# Languages we recognise for stack-mismatch rejection
_BACKEND_LANGUAGES = {
    "java", "go", "golang", "python", "rust", "scala", "kotlin",
    "c++", "c#", "ruby", "php", "node", "node.js", "typescript",
    "elixir", "haskell", "clojure", "erlang", "swift",
}
_REJECT_ONLY_STACKS = {
    "node.js", "node", "ruby on rails", "rails", ".net", "php",
}


def build_scoring_system_prompt(profile: dict, resume_text: str = None) -> str:
    """Build a candidate-specific LLM scoring prompt from live profile data."""
    role            = (profile.get("role") or "Software Engineer").strip()
    skills          = [s.strip() for s in (profile.get("skills") or []) if s.strip()]
    exp_years       = int(profile.get("experience_years") or 0)
    prefs           = profile.get("preferences") or {}

    remote_only         = bool(prefs.get("remote_only", False))
    preferred_locations = (prefs.get("preferred_locations") or "").strip()
    preferred_salary    = (prefs.get("preferred_salary") or "").strip()
    preferred_size      = (prefs.get("preferred_company_size") or "").strip()

    # ── Candidate section ────────────────────────────────────────────────────
    skills_str = ", ".join(skills) if skills else "Not specified"

    if remote_only:
        location_line = "Wants fully remote only (global companies)"
    elif preferred_locations:
        location_line = f"Preferred locations: {preferred_locations}"
    else:
        location_line = "Open to remote and hybrid"

    extra_prefs = []
    if preferred_salary:
        extra_prefs.append(f"Salary expectation: {preferred_salary}")
    if preferred_size:
        extra_prefs.append(f"Preferred company size: {preferred_size}")
    extra_prefs_str = ("\n- " + "\n- ".join(extra_prefs)) if extra_prefs else ""

    # ── Resume excerpt ───────────────────────────────────────────────────────
    resume_section = ""
    if resume_text and resume_text.strip():
        snippet = resume_text.strip()[:2000]
        resume_section = f"\nRESUME EXCERPT (use this as the ground truth for skills and experience):\n{snippet}\n"

    # ── Scoring rubric — derived from top skills ─────────────────────────────
    top3 = skills[:3] if skills else []
    top3_str = " + ".join(top3) if top3 else role

    # Hard reject experience threshold: candidate's years + 2
    reject_exp_threshold = exp_years + 2

    # Detect candidate's primary languages to build stack-mismatch reject rule
    candidate_langs = {s.lower() for s in skills} & _BACKEND_LANGUAGES
    reject_stacks   = _REJECT_ONLY_STACKS - candidate_langs  # don't reject stacks the candidate actually has
    reject_stack_str = ""
    if reject_stacks:
        listed = sorted(reject_stacks)[:4]   # cap at 4 examples for brevity
        reject_stack_str = (
            f"\n- Role requires ONLY {' / '.join(listed)} with no path to candidate's stack"
        )

    location_reject = "\n- On-site only or explicitly excludes remote workers" if remote_only else ""

    return f"""You are a precise job-fit evaluator. Score each job listing for the specific candidate described below.

CANDIDATE:
- Role: {role}
- Experience: {exp_years} years
- Skills: {skills_str}
- Location: {location_line}{extra_prefs_str}
{resume_section}
SCORING RULES:
Return ONLY a JSON array — one object per job, same order as input. No text outside the JSON.
Format per item: {{"id": <job_id>, "score": <1-10>, "reason": "<one sentence>", "red_flags": ["<flag>"], "apply_method": "direct|cold_email"}}

score 9-10: Near-perfect match — {top3_str} + core domain + remote-friendly
score 7-8:  Strong match — most of candidate's primary skills present, remote ok
score 5-6:  Partial match — some skills overlap, stack or location uncertain
score 3-4:  Weak match — wrong stack or domain but company/domain is interesting
score 1-2:  Hard reject (see below)

HARD REJECT (return score: 1) if ANY of:{location_reject}
- Requires {reject_exp_threshold}+ years of experience{reject_stack_str}
- IT services, staffing, outsourcing, or body-shop company
- No backend, platform, or infrastructure work involved
- Job posted more than 10 days ago

apply_method: return "cold_email" if the company appears small/early-stage with no
formal application link, "direct" otherwise."""

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower()
VALID_PROVIDERS = {"gemini", "openai", "anthropic", "grok"}

if LLM_PROVIDER not in VALID_PROVIDERS:
    raise RuntimeError(
        f"Invalid LLM_PROVIDER '{LLM_PROVIDER}'. Must be one of: {', '.join(VALID_PROVIDERS)}"
    )

# Initialize the right client at module load time
if LLM_PROVIDER == "gemini":
    import google.generativeai as genai
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is required when LLM_PROVIDER=gemini")
    genai.configure(api_key=GEMINI_API_KEY)
    _gemini_model = genai.GenerativeModel("gemini-1.5-flash")

elif LLM_PROVIDER == "openai":
    from openai import AsyncOpenAI
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")
    _openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

elif LLM_PROVIDER == "anthropic":
    import anthropic as anthropic_sdk
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic")
    _anthropic_client = anthropic_sdk.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

elif LLM_PROVIDER == "grok":
    from openai import AsyncOpenAI
    XAI_API_KEY = os.getenv("XAI_API_KEY")
    if not XAI_API_KEY:
        raise RuntimeError("XAI_API_KEY is required when LLM_PROVIDER=grok")
    _grok_client = AsyncOpenAI(api_key=XAI_API_KEY, base_url="https://api.x.ai/v1")


def _should_retry(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(k in msg for k in ["rate limit", "429", "quota", "overloaded", "capacity"])


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(Exception),
    reraise=True,
)
async def generate(prompt: str, system: Optional[str] = None) -> Union[str, dict]:
    """Send prompt to the configured LLM. Returns dict if response is valid JSON, else str."""
    text = await _call_provider(prompt, system)

    # Try to parse JSON if the prompt requests it (case-insensitive check)
    _pl = prompt.lower()
    if "in json" in _pl or "as json" in _pl or "json:" in _pl:
        # Strip markdown code fences if present
        stripped = text.strip()
        if stripped.startswith("```"):
            lines = stripped.split("\n")
            # Remove first and last fence lines
            inner = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
            stripped = inner.strip()
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            # Try to find JSON object within the text
            import re
            match = re.search(r'\{.*\}', stripped, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
            return stripped
    return text


async def _call_provider(prompt: str, system: Optional[str]) -> str:
    if LLM_PROVIDER == "gemini":
        return await _call_gemini(prompt, system)
    elif LLM_PROVIDER == "openai":
        return await _call_openai(prompt, system)
    elif LLM_PROVIDER == "anthropic":
        return await _call_anthropic(prompt, system)
    elif LLM_PROVIDER == "grok":
        return await _call_grok(prompt, system)


async def _call_gemini(prompt: str, system: Optional[str]) -> str:
    full_prompt = f"{system}\n\n{prompt}" if system else prompt
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None, lambda: _gemini_model.generate_content(full_prompt)
    )
    return response.text


async def _call_openai(prompt: str, system: Optional[str]) -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    response = await _openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        temperature=0.3,
    )
    return response.choices[0].message.content


async def _call_anthropic(prompt: str, system: Optional[str]) -> str:
    kwargs = {"model": "claude-3-5-haiku-20241022", "max_tokens": 2048, "messages": [{"role": "user", "content": prompt}]}
    if system:
        kwargs["system"] = system
    response = await _anthropic_client.messages.create(**kwargs)
    return response.content[0].text


async def _call_grok(prompt: str, system: Optional[str]) -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    response = await _grok_client.chat.completions.create(
        model="grok-2-latest",
        messages=messages,
        temperature=0.3,
    )
    return response.choices[0].message.content


def get_langchain_llm():
    """Return the appropriate LangChain LLM instance for the configured provider."""
    if LLM_PROVIDER == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=os.getenv("GEMINI_API_KEY"),
            temperature=0.3,
        )
    elif LLM_PROVIDER == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model="gpt-4o-mini",
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            temperature=0.3,
        )
    elif LLM_PROVIDER == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model="claude-3-5-haiku-20241022",
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
            temperature=0.3,
        )
    elif LLM_PROVIDER == "grok":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model="grok-2-latest",
            openai_api_key=os.getenv("XAI_API_KEY"),
            openai_api_base="https://api.x.ai/v1",
            temperature=0.3,
        )
