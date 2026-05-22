import asyncio
import hashlib
import httpx
from typing import List, Dict

# Re-use the same location allow/block sets as job_boards.py
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

# ─── Company slug lists ──────────────────────────────────────────────────────
# These are the ATS board slugs for well-known tech companies.
# Slugs that 404 are silently skipped.

GREENHOUSE_SLUGS = [
    "airbnb", "stripe", "discord", "figma", "notion", "dropbox", "coinbase",
    "robinhood", "chime", "affirm", "brex", "ramp", "plaid", "gusto", "rippling",
    "lattice", "carta", "vanta", "cloudflare", "fastly", "datadog", "databricks",
    "snowflake", "mongodb", "elastic", "confluent", "hashicorp", "twilio",
    "sendgrid", "okta", "pagerduty", "sentry", "mixpanel", "segment", "amplitude",
    "linear", "retool", "airtable", "coda", "loom", "miro", "figma",
    "pitch", "canva", "framer", "webflow", "bubble", "glide", "softr",
    "supabase", "planetscale", "neon", "turso", "xata", "fauna", "cockroachdb",
    "singlestore", "timescaledb", "questdb", "influxdata", "yugabyte", "pingcap",
    "clickhouse", "starburst", "dremio", "ahana", "imply", "acryl-data",
    "datahub-project", "stemma", "metaphor", "atlan", "collibra", "alation",
    "informatica", "talend", "matillion", "fivetran", "airbyte", "stitch",
    "hightouch", "census", "polytomic", "y42", "hevodata", "estuary",
    "dbt-labs", "prefect", "dagster", "astronomer", "mage-ai", "orchest",
    "metabase", "lightdash", "preset", "hex", "mode", "sigma-computing",
    "grafana", "chronosphere", "lightstep", "honeycomb", "last9", "coroot",
    "incident-io", "rootly", "firehydrant", "blameless", "opsgenie",
    "vercel", "netlify", "railway", "render", "fly-io", "cyclic",
    "dagger", "earthly", "depot", "buildkite", "circleci", "semaphore",
    "humanloop", "scale-ai", "labelbox", "snorkel-ai", "activeloop",
    "weights-biases", "comet-ml", "neptune-ai", "mlflow", "bentoml",
    "modal", "replicate", "huggingface", "together-ai", "anyscale", "ray",
    "deepmind", "anthropic", "openai", "cohere", "ai21-labs", "mistral",
    "groq", "cerebras", "sambanova", "graphcore", "tenstorrent",
    "descript", "runway", "pika", "stability-ai", "midjourney",
    "jasper", "copy-ai", "writer", "typeface", "anyword",
    "brainfish", "forethought", "kustomer", "gorgias", "freshworks",
    "intercom", "zendesk", "gladly", "helpscout", "groove",
    "close", "outreach", "salesloft", "apollo", "instantly",
    "mixmax", "yesware", "woodpecker", "lemlist", "quickmail",
    "hunter", "snov", "findthatlead", "voilanorbert", "clearbit",
    "zoominfo", "lusha", "seamless", "kaspr", "uplead",
]

LEVER_SLUGS = [
    "netflix", "shopify", "figma", "notion", "canva", "gitlab", "hashicorp",
    "vercel", "netlify", "supabase", "planetscale", "prisma", "neon",
    "oxide", "fly", "render", "railway", "depot", "buildkite",
    "linear", "loom", "miro", "pitch", "framer", "webflow",
    "retool", "airtable", "coda", "rows", "tally", "typeform",
    "posthog", "june", "koala", "rewardful", "paddle", "lemon-squeezy",
    "clerk", "workos", "stytch", "magic", "ory", "zitadel",
    "nango", "merge", "apideck", "vessel", "tray", "workato",
    "zapier", "make", "pipedream", "n8n", "activepieces", "integrately",
    "cal", "savvycal", "doodle", "claap", "loom", "grain",
    "read-ai", "fireflies", "otter", "fathom", "sembly", "avoma",
    "gong", "chorus", "salesloft", "outreach", "apollo", "instantly",
    "close", "hubspot", "pipedrive", "copper", "folk", "affinity",
    "attio", "twenty", "clay", "breakcold", "warmly", "lyne",
    "rocketreach", "contactout", "wiza", "findymail", "emailsearch",
    "reachfast", "getprospect", "minelead", "prospeo", "anymailfinder",
    "pry", "runway", "mosaic", "causal", "pigment", "abacum",
    "cube", "metriql", "lightdash", "evidence", "observable", "count",
    "streamlit", "gradio", "panel", "voila", "marimo", "mercury",
    "weights-biases", "comet", "neptune", "clearml", "dvc", "zenml",
    "bentoml", "seldon", "kserve", "torchserve", "triton", "ray-serve",
    "modal", "replicate", "banana", "beam", "mystic", "runpod",
    "together", "fireworks", "perplexity", "you", "phind", "cursor",
    "codeium", "tabnine", "sourcegraph", "swimm", "mintlify", "gitbook",
    "readme", "archbee", "document360", "tettra", "slab", "notion",
    "nuclino", "slite", "guru", "helpjuice", "stonly", "scribe",
    "tango", "guidde", "supademo", "arcade", "navattic", "tourial",
    "demostack", "reprise", "storylane", "walnut", "consensus", "saleo",
]

ASHBY_SLUGS = [
    "linear", "retool", "dbt-labs", "airbyte", "prefect", "dagster",
    "mage", "astronomer", "orchestra", "windmill", "kestra",
    "posthog", "june", "mixpanel", "amplitude", "heap", "fullstory",
    "logrocket", "highlight", "mouseflow", "hotjar", "smartlook",
    "clarity", "contentsquare", "glassbox", "quantum-metric",
    "pendo", "appcues", "chameleon", "userflow", "product-fruits",
    "intercom", "crisp", "freshchat", "tidio", "drift", "qualified",
    "chili-piper", "salesloft", "outreach", "apollo", "instantly",
    "clay", "breakcold", "warmly", "lyne", "lavender", "regie",
    "nooks", "orum", "connect-and-sell", "outplay", "reply",
    "woodpecker", "lemlist", "quickmail", "mailshake", "gmass",
    "hunter", "snov", "findthatlead", "voilanorbert", "clearbit",
    "vanta", "drata", "secureframe", "anecdotes", "sprinto",
    "tugboat-logic", "strike-graph", "laika", "scytale", "hyperproof",
    "riskonnect", "resolver", "logicgate", "archer", "diligent",
    "navex", "ethicspoint", "convercent", "integrity-line", "speak-up",
    "culture-amp", "lattice", "leapsome", "betterworks", "15five",
    "reflektive", "small-improvements", "trakstar", "engagedly", "profit",
    "workleap", "officevibe", "tinypulse", "peakon", "glint",
    "medal", "bonusly", "nectar", "kudos", "assembly", "kazoo",
    "fond", "awardco", "motivosity", "terryberry", "bucketlist",
    "workhuman", "o-c-tanner", "baudville", "successories", "giftogram",
    "snappy", "goody", "sendoso", "alyce", "postal", "printfection",
    "calixa", "vitally", "gainsight", "totango", "planhat", "churnzero",
    "catalyst", "customerio", "braze", "klaviyo", "iterable", "sendgrid",
    "mailchimp", "campaignmonitor", "activecampaign", "drip", "convertkit",
    "beehiiv", "substack", "ghost", "wordpress", "webflow", "framer",
    "cargo", "squarespace", "wix", "editor-x", "duda", "jimdo",
]


def _dedup_key(company_name: str, title: str) -> str:
    raw = f"{company_name.lower().strip()}{title.lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _is_relevant(title: str, description: str, keywords: List[str],
                 role_keywords: List[str] = None) -> bool:
    """
    Title-primary relevance check. ATS listing APIs often return empty descriptions
    so a title match alone is sufficient.
    Passes if:
      - Any keyword (role or skill) appears in the title, OR
      - At least 2 keywords appear in description (when non-empty)
    """
    title_lower = title.lower()
    all_keywords = list(keywords)
    if role_keywords:
        all_keywords = list(role_keywords) + all_keywords

    if any(kw.lower() in title_lower for kw in all_keywords):
        return True
    if description:
        desc_lower = description.lower()
        hits = sum(1 for kw in all_keywords if kw.lower() in desc_lower)
        return hits >= 2
    return False


async def _fetch_greenhouse_company(client: httpx.AsyncClient, slug: str, keywords: List[str], role_keywords: List[str] = None) -> List[Dict]:
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
                "company_name": slug.replace("-", " ").title(),
                "company_website": f"https://greenhouse.io/{slug}",
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


async def _fetch_lever_company(client: httpx.AsyncClient, slug: str, keywords: List[str], role_keywords: List[str] = None) -> List[Dict]:
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
                "company_name": slug.replace("-", " ").title(),
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


async def _fetch_ashby_company(client: httpx.AsyncClient, slug: str, keywords: List[str], role_keywords: List[str] = None) -> List[Dict]:
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
                "company_name": slug.replace("-", " ").title(),
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


async def fetch_ats_jobs(profile: dict) -> List[Dict]:
    """
    Fetch jobs from Greenhouse, Lever, and Ashby for all known companies.
    Filters locally by profile keywords. No API keys required.
    """
    role = (profile.get("role") or "").lower()
    skills = [s.lower().strip() for s in (profile.get("skills") or []) if s]
    keywords = skills + ([role] if role else [])
    keywords = [k for k in keywords if k]

    # Role keywords: meaningful words only
    stop_words = {"and", "or", "the", "for", "with", "from", "senior", "junior",
                  "lead", "staff", "principal", "associate", "remote"}
    role_keywords = [w for w in role.split() if len(w) > 2 and w not in stop_words]

    if not keywords:
        return []

    all_jobs: List[Dict] = []
    seen_keys: set = set()

    limits = httpx.Limits(max_connections=30, max_keepalive_connections=20)
    async with httpx.AsyncClient(limits=limits) as client:
        # Greenhouse — batch all company requests concurrently
        gh_tasks = [_fetch_greenhouse_company(client, slug, keywords, role_keywords) for slug in GREENHOUSE_SLUGS]
        gh_results = await asyncio.gather(*gh_tasks, return_exceptions=True)
        for result in gh_results:
            if isinstance(result, list):
                for job in result:
                    key = job.get("dedup_key", "")
                    if key and key not in seen_keys and job.get("source_url"):
                        seen_keys.add(key)
                        all_jobs.append(job)

        # Lever
        lever_tasks = [_fetch_lever_company(client, slug, keywords, role_keywords) for slug in LEVER_SLUGS]
        lever_results = await asyncio.gather(*lever_tasks, return_exceptions=True)
        for result in lever_results:
            if isinstance(result, list):
                for job in result:
                    key = job.get("dedup_key", "")
                    if key and key not in seen_keys and job.get("source_url"):
                        seen_keys.add(key)
                        all_jobs.append(job)

        # Ashby
        ashby_tasks = [_fetch_ashby_company(client, slug, keywords, role_keywords) for slug in ASHBY_SLUGS]
        ashby_results = await asyncio.gather(*ashby_tasks, return_exceptions=True)
        for result in ashby_results:
            if isinstance(result, list):
                for job in result:
                    key = job.get("dedup_key", "")
                    if key and key not in seen_keys and job.get("source_url"):
                        seen_keys.add(key)
                        all_jobs.append(job)

    return all_jobs
