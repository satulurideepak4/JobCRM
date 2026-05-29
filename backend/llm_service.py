import os
import json
import asyncio
from typing import Optional, Union
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from dotenv import load_dotenv

load_dotenv()

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
