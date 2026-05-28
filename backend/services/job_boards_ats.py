"""
ATS board scrapers: Greenhouse, Lever, Ashby.
No API keys required — all public endpoints.

Improvements:
- Role-aware slug selection: only hit companies relevant to the user's role
- Proper company name resolution (not just slug.title())
- Expanded YC/startup slug lists
- Better relevance check handles empty descriptions
"""
import asyncio
import hashlib
import httpx
from typing import List, Dict, Set

ALLOWED_LOCATIONS = {
    "remote", "worldwide", "anywhere", "global", "us", "usa", "united states",
    "canada", "north america", "us/canada", "usa/canada",
    "est", "cst", "mst", "pst", "pt", "ct", "mt", "et",
    "eastern", "central", "mountain", "pacific",
    "utc-4", "utc-5", "utc-6", "utc-7", "utc-8",
    "new york", "san francisco", "seattle", "austin", "chicago",
    "los angeles", "boston", "denver", "atlanta", "miami",
    "toronto", "vancouver", "montreal",
}

BLOCKED_LOCATIONS = {
    "uk", "united kingdom", "europe", "eu", "germany", "france", "spain",
    "netherlands", "sweden", "norway", "denmark", "finland", "poland",
    "australia", "new zealand", "india", "china", "japan", "singapore",
    "brazil", "mexico", "argentina", "latin america", "apac", "emea",
}


def _is_allowed_location(location: str) -> bool:
    if not location:
        return True
    loc = location.lower().strip()
    if any(blocked in loc for blocked in BLOCKED_LOCATIONS):
        return False
    if any(allowed in loc for allowed in ALLOWED_LOCATIONS):
        return True
    if "remote" in loc:
        return True
    return True


def _dedup_key(company_name: str, title: str) -> str:
    raw = f"{company_name.lower().strip()}{title.lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Proper company names (slug → display name) ────────────────────────────────

COMPANY_DISPLAY_NAMES: Dict[str, str] = {
    # Infrastructure / Cloud
    "fly-io": "Fly.io", "vercel": "Vercel", "netlify": "Netlify",
    "railway": "Railway", "render": "Render", "depot": "Depot",
    "buildkite": "Buildkite", "circleci": "CircleCI", "earthly": "Earthly",
    "dagger": "Dagger", "fastly": "Fastly", "cloudflare": "Cloudflare",

    # Databases
    "supabase": "Supabase", "planetscale": "PlanetScale", "neon": "Neon",
    "turso": "Turso", "cockroachdb": "CockroachDB", "questdb": "QuestDB",
    "timescaledb": "Timescale", "singlestore": "SingleStore",
    "influxdata": "InfluxData", "yugabyte": "YugabyteDB",
    "pingcap": "PingCAP", "fauna": "Fauna", "xata": "Xata",

    # Data / Analytics
    "dbt-labs": "dbt Labs", "airbyte": "Airbyte", "fivetran": "Fivetran",
    "prefect": "Prefect", "dagster": "Dagster", "astronomer": "Astronomer",
    "mage-ai": "Mage AI", "metabase": "Metabase", "lightdash": "Lightdash",
    "hex": "Hex", "mode": "Mode Analytics", "sigma-computing": "Sigma",
    "hightouch": "Hightouch", "census": "Census", "estuary": "Estuary",
    "grafana": "Grafana", "chronosphere": "Chronosphere",
    "honeycomb": "Honeycomb", "last9": "Last9",

    # AI / ML
    "openai": "OpenAI", "anthropic": "Anthropic", "cohere": "Cohere",
    "ai21-labs": "AI21 Labs", "mistral": "Mistral AI", "groq": "Groq",
    "cerebras": "Cerebras", "modal": "Modal", "replicate": "Replicate",
    "anyscale": "Anyscale", "together-ai": "Together AI",
    "weights-biases": "Weights & Biases", "scale-ai": "Scale AI",
    "labelbox": "Labelbox", "humanloop": "Humanloop",
    "huggingface": "HuggingFace", "comet-ml": "Comet ML",
    "bentoml": "BentoML", "descript": "Descript",
    "runway": "Runway", "pika": "Pika", "stability-ai": "Stability AI",

    # Dev Tools
    "linear": "Linear", "retool": "Retool", "posthog": "PostHog",
    "sentry": "Sentry", "datadog": "Datadog", "pagerduty": "PagerDuty",
    "incident-io": "incident.io", "rootly": "Rootly",
    "sourcegraph": "Sourcegraph", "codeium": "Codeium",
    "mintlify": "Mintlify", "readme": "ReadMe",

    # Auth / Security
    "clerk": "Clerk", "workos": "WorkOS", "stytch": "Stytch",
    "magic": "Magic", "vanta": "Vanta", "drata": "Drata",
    "secureframe": "Secureframe",

    # Product / No-code
    "notion": "Notion", "airtable": "Airtable", "coda": "Coda",
    "retool": "Retool", "loom": "Loom", "miro": "Miro",
    "figma": "Figma", "framer": "Framer", "webflow": "Webflow",

    # Fintech
    "stripe": "Stripe", "plaid": "Plaid", "brex": "Brex",
    "ramp": "Ramp", "affirm": "Affirm", "chime": "Chime",
    "robinhood": "Robinhood", "coinbase": "Coinbase",
    "rippling": "Rippling", "gusto": "Gusto",

    # Communication / Collab
    "discord": "Discord", "loom": "Loom", "cal": "Cal.com",

    # Payments / Commerce
    "paddle": "Paddle", "lemon-squeezy": "Lemon Squeezy",
    "rewardful": "Rewardful",

    # Sales / CRM
    "clay": "Clay", "attio": "Attio", "close": "Close CRM",
    "apollo": "Apollo", "outreach": "Outreach", "gong": "Gong",

    # Analytics / Growth
    "mixpanel": "Mixpanel", "amplitude": "Amplitude", "segment": "Segment",
    "june": "June", "heap": "Heap", "fullstory": "FullStory",

    # YC recent
    "exa": "Exa", "induced-ai": "Induced AI", "nango": "Nango",
    "merge": "Merge", "trigger-dev": "Trigger.dev",
}


def _company_name(slug: str) -> str:
    """Return a human-readable company name from its ATS slug."""
    if slug in COMPANY_DISPLAY_NAMES:
        return COMPANY_DISPLAY_NAMES[slug]

    parts = slug.split("-")
    result = []
    for part in parts:
        if part.lower() in {"ai", "ml", "api", "sdk", "crm", "erp", "ui", "ux", "db", "io", "hq"}:
            result.append(part.upper())
        elif part.lower() in {"io", "co", "ly", "fy", "vy"}:
            result.append(part.lower())
        else:
            result.append(part.capitalize())
    return " ".join(result)


# ── Role-aware slug lists ─────────────────────────────────────────────────────
# Organized by category. Each search picks relevant subsets based on the user's role.

# These companies are relevant to ALL roles (product tools, infrastructure everyone touches)
UNIVERSAL_SLUGS = {
    "greenhouse": [
        "stripe", "discord", "notion", "dropbox", "coinbase",
        "robinhood", "chime", "affirm", "brex", "ramp", "plaid", "gusto", "rippling",
        "cloudflare", "fastly", "datadog", "snowflake", "mongodb", "elastic", "confluent",
        "twilio", "okta", "pagerduty", "sentry", "mixpanel", "segment", "amplitude",
        "linear", "retool", "airtable", "loom", "miro", "figma",
        "supabase", "neon", "cockroachdb", "singlestore",
        "dbt-labs", "prefect", "dagster", "astronomer", "airbyte",
        "metabase", "grafana", "honeycomb",
        "humanloop", "scale-ai", "labelbox",
        "weights-biases", "modal", "replicate", "anyscale",
        "anthropic", "openai", "cohere", "mistral", "groq",
        "vercel", "netlify", "railway", "render", "fly-io",
        "buildkite", "circleci", "dagger",
        "incident-io", "rootly",
        "vanta", "drata", "secureframe",
        "posthog", "amplitude",
        "clerk", "workos", "stytch",
    ],
    "lever": [
        "netflix", "shopify", "gitlab", "hashicorp",
        "vercel", "netlify", "supabase", "planetscale", "neon",
        "linear", "loom", "miro", "framer", "webflow",
        "retool", "airtable", "coda",
        "posthog", "june",
        "clerk", "workos",
        "nango", "merge",
        "cal",
        "gong", "salesloft", "outreach", "apollo",
        "close", "attio", "clay",
        "pry", "runway-financial",
        "weights-biases", "modal", "replicate",
        "together", "fireworks", "perplexity",
        "codeium", "sourcegraph", "mintlify",
        "paddle", "lemon-squeezy",
    ],
    "ashby": [
        "linear", "retool", "dbt-labs", "airbyte", "prefect", "dagster",
        "mage", "astronomer",
        "posthog", "june", "mixpanel",
        "vanta", "drata", "secureframe",
        "clerk", "workos",
        "clay", "attio",
        "nango", "merge",
        "hightouch", "census",
        "incident-io",
        "exa", "induced-ai",
        "trigger-dev",
        "grafana",
        "codeium",
    ],
}

# AI / ML specific
AI_ML_SLUGS = {
    "greenhouse": [
        "anthropic", "openai", "cohere", "ai21-labs", "mistral", "groq", "cerebras",
        "scale-ai", "labelbox", "snorkel-ai",
        "weights-biases", "comet-ml", "modal", "replicate", "anyscale",
        "deepmind", "huggingface", "together-ai",
        "descript", "runway", "pika", "stability-ai",
        "humanloop", "bentoml",
    ],
    "lever": [
        "together", "fireworks", "perplexity", "cursor", "codeium",
        "weights-biases", "modal", "replicate", "banana",
        "read-ai", "fireflies",
    ],
    "ashby": [
        "exa", "induced-ai", "humanloop",
        "codeium", "mintlify",
    ],
}

# Backend / API / Systems
BACKEND_SLUGS = {
    "greenhouse": [
        "cloudflare", "fastly", "datadog", "elastic", "confluent",
        "mongodb", "cockroachdb", "questdb", "timescaledb", "singlestore",
        "supabase", "neon", "turso", "planetscale",
        "twilio", "stripe", "plaid",
        "dbt-labs", "airbyte", "fivetran", "estuary",
        "prefect", "dagster", "astronomer",
        "grafana", "honeycomb", "chronosphere", "last9",
        "pagerduty", "incident-io",
        "fly-io", "render", "railway",
        "buildkite", "circleci", "earthly", "dagger",
        "influxdata", "yugabyte",
    ],
    "lever": [
        "hashicorp", "gitlab",
        "supabase", "planetscale", "neon",
        "fly", "render", "railway", "depot",
        "buildkite",
        "nango", "merge",
        "trigger-dev",
    ],
    "ashby": [
        "dbt-labs", "airbyte", "prefect", "dagster",
        "hightouch", "census", "estuary",
        "neon", "turso",
        "trigger-dev",
        "last9",
    ],
}

# Frontend / Full-stack
FRONTEND_SLUGS = {
    "greenhouse": [
        "figma", "notion", "airtable", "loom", "miro",
        "vercel", "netlify",
        "webflow", "framer",
        "retool", "coda",
        "linear",
        "posthog",
    ],
    "lever": [
        "vercel", "netlify", "supabase",
        "linear", "loom", "miro", "framer", "webflow",
        "retool", "airtable", "coda",
        "posthog",
        "codeium",
    ],
    "ashby": [
        "linear", "posthog", "retool",
        "codeium", "mintlify",
    ],
}

# DevOps / Platform / SRE
DEVOPS_SLUGS = {
    "greenhouse": [
        "cloudflare", "fastly", "datadog", "elastic",
        "pagerduty", "incident-io", "sentry",
        "grafana", "honeycomb", "chronosphere",
        "buildkite", "circleci", "earthly", "dagger",
        "fly-io", "render", "railway", "vercel", "netlify",
        "hashicorp",
    ],
    "lever": [
        "hashicorp", "gitlab",
        "fly", "render", "railway", "depot",
        "buildkite",
    ],
    "ashby": [
        "incident-io", "grafana", "last9",
        "dagger",
    ],
}

# Data Engineering / Analytics
DATA_SLUGS = {
    "greenhouse": [
        "dbt-labs", "airbyte", "fivetran", "stitch",
        "prefect", "dagster", "astronomer", "mage-ai",
        "hightouch", "census",
        "metabase", "lightdash", "hex", "mode", "sigma-computing",
        "grafana", "honeycomb",
        "snowflake", "databricks", "elastic",
        "influxdata", "timescaledb",
    ],
    "lever": [
        "weights-biases",
        "lightdash",
    ],
    "ashby": [
        "dbt-labs", "airbyte", "prefect", "dagster",
        "hightouch", "census",
        "lightdash",
    ],
}


def _select_slugs(profile: Dict) -> Dict[str, List[str]]:
    """
    Pick relevant ATS slug subsets based on the user's role and skills.
    Always starts with universal slugs, then adds role-specific ones.
    Deduplicates across categories.
    """
    role = (profile.get("role") or "").lower()
    skills = [s.lower() for s in (profile.get("skills") or [])]
    skills_str = " ".join(skills)

    selected: Dict[str, Set[str]] = {
        "greenhouse": set(UNIVERSAL_SLUGS["greenhouse"]),
        "lever": set(UNIVERSAL_SLUGS["lever"]),
        "ashby": set(UNIVERSAL_SLUGS["ashby"]),
    }

    def _add(category_slugs: Dict[str, List[str]]):
        for ats, slugs in category_slugs.items():
            selected[ats].update(slugs)

    # AI / ML
    if any(x in role for x in ["ml", "machine learning", "ai", "data science", "nlp", "llm"]) or \
       any(x in skills_str for x in ["pytorch", "tensorflow", "llm", "transformers", "langchain", "ml"]):
        _add(AI_ML_SLUGS)

    # Backend
    if any(x in role for x in ["backend", "back-end", "api", "server", "platform", "systems"]) or \
       any(x in skills_str for x in ["fastapi", "django", "flask", "rails", "spring", "go", "rust", "grpc"]):
        _add(BACKEND_SLUGS)

    # Frontend / Full-stack
    if any(x in role for x in ["frontend", "front-end", "ui", "full stack", "fullstack"]) or \
       any(x in skills_str for x in ["react", "vue", "angular", "svelte", "nextjs", "typescript"]):
        _add(FRONTEND_SLUGS)

    # DevOps / Platform
    if any(x in role for x in ["devops", "sre", "platform", "infra", "infrastructure", "reliability"]) or \
       any(x in skills_str for x in ["kubernetes", "terraform", "docker", "aws", "gcp", "azure", "helm"]):
        _add(DEVOPS_SLUGS)

    # Data
    if any(x in role for x in ["data engineer", "analytics", "data platform", "etl"]) or \
       any(x in skills_str for x in ["dbt", "airflow", "spark", "kafka", "flink", "dagster", "prefect"]):
        _add(DATA_SLUGS)

    return {ats: list(slugs) for ats, slugs in selected.items()}


# ── Relevance check ───────────────────────────────────────────────────────────

def _is_relevant(title: str, description: str, keywords: List[str],
                 role_keywords: List[str] = None) -> bool:
    """
    Title-primary relevance. ATS listings often have sparse or missing descriptions.
    Passes if:
      - Any keyword matches in the title (sufficient on its own for ATS boards), OR
      - 2+ keywords match in the description when description is present
    """
    title_lower = title.lower()
    all_keywords = list(keywords)
    if role_keywords:
        all_keywords = list(role_keywords) + all_keywords

    if any(kw.lower() in title_lower for kw in all_keywords):
        return True

    if description and len(description) > 100:
        desc_lower = description.lower()
        hits = sum(1 for kw in all_keywords if kw.lower() in desc_lower)
        return hits >= 2

    return False


# ── Per-ATS fetchers ──────────────────────────────────────────────────────────

async def _fetch_greenhouse_company(
    client: httpx.AsyncClient, slug: str,
    keywords: List[str], role_keywords: List[str] = None
) -> List[Dict]:
    try:
        resp = await client.get(
            f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
            params={"content": "true"},
            timeout=10,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        jobs = []
        for job in data.get("jobs", []):
            title = job.get("title", "")
            location = ""
            for loc in job.get("offices", []):
                location = loc.get("name", "")
                break
            if not _is_allowed_location(location):
                continue
            if not _is_relevant(title, job.get("content", ""), keywords, role_keywords):
                continue
            jobs.append({
                "title": title,
                "company_name": _company_name(slug),
                "company_website": f"https://boards.greenhouse.io/{slug}",
                "description": job.get("content", "")[:3000],
                "location": location or "Remote",
                "salary_range": "",
                "job_type": "full-time",
                "source": "greenhouse",
                "source_url": job.get("absolute_url", ""),
                "tags": [d.get("name", "") for d in job.get("departments", []) if d.get("name")],
                "dedup_key": _dedup_key(slug, title),
            })
        return jobs
    except Exception:
        return []


async def _fetch_lever_company(
    client: httpx.AsyncClient, slug: str,
    keywords: List[str], role_keywords: List[str] = None
) -> List[Dict]:
    try:
        resp = await client.get(
            f"https://api.lever.co/v0/postings/{slug}",
            params={"mode": "json", "commitment": "Full-time"},
            timeout=10,
        )
        if resp.status_code != 200:
            return []
        postings = resp.json()
        if not isinstance(postings, list):
            return []
        jobs = []
        for job in postings:
            title = job.get("text", "")
            categories = job.get("categories", {})
            location = categories.get("location", "Remote")
            description = job.get("descriptionPlain", "") or job.get("description", "")
            if not _is_allowed_location(location):
                continue
            if not _is_relevant(title, description, keywords, role_keywords):
                continue
            jobs.append({
                "title": title,
                "company_name": _company_name(slug),
                "company_website": f"https://jobs.lever.co/{slug}",
                "description": description[:3000],
                "location": location,
                "salary_range": "",
                "job_type": categories.get("commitment", "full-time"),
                "source": "lever",
                "source_url": job.get("hostedUrl", ""),
                "tags": [categories.get("team", "")] if categories.get("team") else [],
                "dedup_key": _dedup_key(slug, title),
            })
        return jobs
    except Exception:
        return []


async def _fetch_ashby_company(
    client: httpx.AsyncClient, slug: str,
    keywords: List[str], role_keywords: List[str] = None
) -> List[Dict]:
    try:
        resp = await client.post(
            "https://jobs.ashbyhq.com/api/non-user-facing/job-board/listed-jobs",
            json={"organizationHostedJobsPageName": slug},
            timeout=10,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        jobs = []
        for job in data.get("jobPostings", []):
            title = job.get("title", "")
            team = job.get("teamName", "")
            location = job.get("locationName", "Remote")
            if not _is_allowed_location(location):
                continue
            if not _is_relevant(title, job.get("descriptionSocial", ""), keywords, role_keywords):
                continue
            jobs.append({
                "title": title,
                "company_name": _company_name(slug),
                "company_website": f"https://jobs.ashbyhq.com/{slug}",
                "description": job.get("descriptionSocial", "")[:3000],
                "location": location,
                "salary_range": "",
                "job_type": "full-time",
                "source": "ashby",
                "source_url": job.get("jobPostingUrl", f"https://jobs.ashbyhq.com/{slug}/{job.get('id', '')}"),
                "tags": [team] if team else [],
                "dedup_key": _dedup_key(slug, title),
            })
        return jobs
    except Exception:
        return []


# ── Main entry point ──────────────────────────────────────────────────────────

async def fetch_ats_jobs(profile: dict) -> List[Dict]:
    """
    Fetch jobs from Greenhouse, Lever, and Ashby for companies relevant to this profile.
    Uses role-aware slug selection to avoid hitting hundreds of irrelevant companies.
    """
    role = (profile.get("role") or "").lower()
    skills = [s.lower().strip() for s in (profile.get("skills") or []) if s]
    keywords = skills + ([role] if role else [])
    keywords = [k for k in keywords if k]

    stop_words = {"and", "or", "the", "for", "with", "from", "senior", "junior",
                  "lead", "staff", "principal", "associate", "remote"}
    role_keywords = [w for w in role.split() if len(w) > 2 and w not in stop_words]

    if not keywords:
        return []

    # Select only relevant company slugs for this profile
    slug_sets = _select_slugs(profile)
    greenhouse_slugs = slug_sets["greenhouse"]
    lever_slugs = slug_sets["lever"]
    ashby_slugs = slug_sets["ashby"]

    print(f"ATS: checking {len(greenhouse_slugs)} Greenhouse + {len(lever_slugs)} Lever + {len(ashby_slugs)} Ashby companies")

    all_jobs: List[Dict] = []
    seen_keys: set = set()

    limits = httpx.Limits(max_connections=40, max_keepalive_connections=25)
    async with httpx.AsyncClient(limits=limits) as client:
        # Greenhouse
        gh_tasks = [_fetch_greenhouse_company(client, slug, keywords, role_keywords) for slug in greenhouse_slugs]
        gh_results = await asyncio.gather(*gh_tasks, return_exceptions=True)
        for result in gh_results:
            if isinstance(result, list):
                for job in result:
                    key = job.get("dedup_key", "")
                    if key and key not in seen_keys and job.get("source_url"):
                        seen_keys.add(key)
                        all_jobs.append(job)

        # Lever
        lever_tasks = [_fetch_lever_company(client, slug, keywords, role_keywords) for slug in lever_slugs]
        lever_results = await asyncio.gather(*lever_tasks, return_exceptions=True)
        for result in lever_results:
            if isinstance(result, list):
                for job in result:
                    key = job.get("dedup_key", "")
                    if key and key not in seen_keys and job.get("source_url"):
                        seen_keys.add(key)
                        all_jobs.append(job)

        # Ashby
        ashby_tasks = [_fetch_ashby_company(client, slug, keywords, role_keywords) for slug in ashby_slugs]
        ashby_results = await asyncio.gather(*ashby_tasks, return_exceptions=True)
        for result in ashby_results:
            if isinstance(result, list):
                for job in result:
                    key = job.get("dedup_key", "")
                    if key and key not in seen_keys and job.get("source_url"):
                        seen_keys.add(key)
                        all_jobs.append(job)

    return all_jobs
