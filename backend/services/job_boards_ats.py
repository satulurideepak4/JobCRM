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
from services.date_utils import is_within_days, is_location_ok, extract_skill_keywords

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
    # Cities not in ALLOWED_LOCATIONS that slip through
    "sydney", "melbourne", "brisbane", "perth",
    "hyderabad", "bangalore", "bengaluru", "mumbai", "delhi", "pune", "chennai",
    "lisbon", "porto", "tel aviv", "israel",
    "london", "berlin", "amsterdam", "paris", "stockholm", "dublin",
    "kiev", "kyiv", "warsaw", "prague", "bucharest",
    "lagos", "nairobi", "cairo", "johannesburg",
    "bangkok", "jakarta", "manila", "ho chi minh",
    "hong kong", "taipei", "seoul", "tokyo",
    "saudi", "dubai", "uae", "qatar",
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
    # Default: block unknown locations — we only want US/Canada/Remote
    return False


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
    "tailscale": "Tailscale", "ngrok": "ngrok", "temporal": "Temporal",
    "coreweave": "CoreWeave", "lepton-ai": "Lepton AI", "modal-labs": "Modal",
    "vultr": "Vultr", "linode": "Linode (Akamai)", "digitalocean": "DigitalOcean",
    "northflank": "Northflank", "qovery": "Qovery", "koyeb": "Koyeb",
    "porter": "Porter", "flightcontrol": "Flightcontrol", "zeet": "Zeet",
    "coder": "Coder", "coherence": "Coherence", "encore": "Encore",
    "inngest": "Inngest", "windmill": "Windmill", "pipedream": "Pipedream",
    "temporal-cloud": "Temporal Cloud",

    # Databases
    "supabase": "Supabase", "planetscale": "PlanetScale", "neon": "Neon",
    "turso": "Turso", "cockroachdb": "CockroachDB", "questdb": "QuestDB",
    "timescaledb": "Timescale", "singlestore": "SingleStore",
    "influxdata": "InfluxData", "yugabyte": "YugabyteDB",
    "pingcap": "PingCAP", "fauna": "Fauna", "xata": "Xata",
    "clickhouse": "ClickHouse", "motherduck": "MotherDuck",
    "tinybird": "Tinybird", "rill": "Rill Data", "turbopuffer": "turbopuffer",
    "lancedb": "LanceDB", "weaviate": "Weaviate", "pinecone": "Pinecone",
    "qdrant": "Qdrant", "chroma": "Chroma", "milvus": "Milvus",
    "edgedb": "EdgeDB", "convex": "Convex", "surrealdb": "SurrealDB",

    # Data / Analytics
    "dbt-labs": "dbt Labs", "airbyte": "Airbyte", "fivetran": "Fivetran",
    "prefect": "Prefect", "dagster": "Dagster", "astronomer": "Astronomer",
    "mage-ai": "Mage AI", "metabase": "Metabase", "lightdash": "Lightdash",
    "hex": "Hex", "mode": "Mode Analytics", "sigma-computing": "Sigma",
    "hightouch": "Hightouch", "census": "Census", "estuary": "Estuary",
    "grafana": "Grafana", "chronosphere": "Chronosphere",
    "honeycomb": "Honeycomb", "last9": "Last9", "axiom": "Axiom",
    "cribl": "Cribl", "mezmo": "Mezmo", "observe": "Observe Inc",
    "chalk": "Chalk", "tecton": "Tecton", "arize": "Arize AI",
    "whylabs": "WhyLabs", "fiddler": "Fiddler AI",
    "monte-carlo-data": "Monte Carlo", "datafold": "Datafold",
    "soda-data": "Soda", "metaplane": "Metaplane", "re-data": "Re:Data",
    "coalesce": "Coalesce", "preset": "Preset",

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
    "character": "Character.AI", "inflection-ai": "Inflection AI",
    "adept": "Adept", "imbue": "Imbue", "mistral-ai": "Mistral AI",
    "luma-ai": "Luma AI", "ideogram": "Ideogram", "leonardo-ai": "Leonardo AI",
    "eleven-labs": "ElevenLabs", "elevenlabs": "ElevenLabs",
    "perplexity": "Perplexity AI", "you-com": "You.com",
    "jasper": "Jasper AI", "writer-com": "Writer", "copy-ai": "Copy.ai",
    "baseten": "Baseten", "fireworks-ai": "Fireworks AI",
    "lightning-ai": "Lightning AI", "together": "Together AI",
    "dust": "Dust", "vellum": "Vellum", "portkey": "Portkey",
    "helicone": "Helicone", "braintrust-data": "Braintrust",
    "traceloop": "Traceloop", "langsmith": "LangSmith",
    "aleph-alpha": "Aleph Alpha", "deepl": "DeepL",
    "synthesia": "Synthesia", "heygen": "HeyGen",
    "read-ai": "Read AI", "fireflies": "Fireflies.ai",

    # Dev Tools
    "linear": "Linear", "retool": "Retool", "posthog": "PostHog",
    "sentry": "Sentry", "datadog": "Datadog", "pagerduty": "PagerDuty",
    "incident-io": "incident.io", "rootly": "Rootly",
    "sourcegraph": "Sourcegraph", "codeium": "Codeium",
    "mintlify": "Mintlify", "readme": "ReadMe",
    "cursor": "Cursor", "anysphere": "Anysphere (Cursor)",
    "pieces-app": "Pieces", "snyk": "Snyk", "jfrog": "JFrog",
    "sonatype": "Sonatype", "teleport": "Teleport",
    "1password": "1Password", "bitwarden": "Bitwarden",
    "gitpod": "Gitpod", "coder": "Coder", "replit": "Replit",
    "val-town": "Val Town", "e2b": "E2B", "composio": "Composio",
    "speakeasy": "Speakeasy", "fern-api": "Fern", "stainless": "Stainless",
    "zuplo": "Zuplo", "treblle": "Treblle", "scalar": "Scalar",
    "launchdarkly": "LaunchDarkly", "statsig": "Statsig",
    "split-io": "Split.io", "eppo": "Eppo", "growthbook": "GrowthBook",
    "logrocket": "LogRocket", "pendo": "Pendo", "fullstory": "FullStory",
    "contentsquare": "Contentsquare",
    "warp": "Warp", "fig": "Fig (AWS)",

    # Auth / Security
    "clerk": "Clerk", "workos": "WorkOS", "stytch": "Stytch",
    "magic": "Magic", "vanta": "Vanta", "drata": "Drata",
    "secureframe": "Secureframe", "wiz": "Wiz", "lacework": "Lacework",
    "orca-security": "Orca Security", "crowdstrike": "CrowdStrike",
    "sentinelone": "SentinelOne", "panther-labs": "Panther Labs",
    "tines": "Tines", "torq": "Torq", "swimlane": "Swimlane",
    "abnormal-security": "Abnormal Security",
    "sublime-security": "Sublime Security",
    "persona": "Persona", "alloy": "Alloy", "socure": "Socure",
    "middesk": "Middesk", "sardine": "Sardine",
    "jumpcloud": "JumpCloud", "beyond-identity": "Beyond Identity",
    "opal": "Opal Security", "doppler": "Doppler",
    "infisical": "Infisical", "cerbos": "Cerbos", "permit": "Permit.io",
    "onfido": "Onfido",

    # Product / No-code
    "notion": "Notion", "airtable": "Airtable", "coda": "Coda",
    "loom": "Loom", "miro": "Miro",
    "figma": "Figma", "framer": "Framer", "webflow": "Webflow",
    "rows": "Rows", "tally": "Tally", "typeform": "Typeform",
    "docusign": "DocuSign", "pandadoc": "PandaDoc", "hellosign": "HelloSign",
    "ironclad": "Ironclad",

    # Fintech (US)
    "stripe": "Stripe", "plaid": "Plaid", "brex": "Brex",
    "ramp": "Ramp", "affirm": "Affirm", "chime": "Chime",
    "robinhood": "Robinhood", "coinbase": "Coinbase",
    "rippling": "Rippling", "gusto": "Gusto",
    "mercury": "Mercury", "modern-treasury": "Modern Treasury",
    "unit-finance": "Unit", "treasury-prime": "Treasury Prime",
    "marqeta": "Marqeta", "checkout": "Checkout.com",
    "klarna": "Klarna", "sezzle": "Sezzle",
    "deel": "Deel", "remote": "Remote", "oyster": "Oyster HR",
    "papaya-global": "Papaya Global", "pilot": "Pilot",
    "lithic": "Lithic", "synctera": "Synctera", "airbase": "Airbase",
    "zip-hq": "Zip", "rho-business": "Rho", "melio": "Melio",
    "increase": "Increase", "column": "Column",
    "payoneer": "Payoneer", "tipalti": "Tipalti",
    "clearco": "Clearco", "pipe": "Pipe",

    # Fintech (EU)
    "revolut": "Revolut", "wise": "Wise", "n26": "N26",
    "sumup": "SumUp", "pleo": "Pleo", "qonto": "Qonto",
    "pennylane": "Pennylane", "payfit": "PayFit", "alan": "Alan",
    "mollie": "Mollie", "mangopay": "Mangopay",
    "gocardless": "GoCardless", "yapily": "Yapily",
    "truelayer": "TrueLayer", "volt": "Volt",
    "trade-republic": "Trade Republic", "scalable-capital": "Scalable Capital",
    "taxfix": "Taxfix", "clark": "Clark", "curve": "Curve",
    "bitpanda": "Bitpanda", "bux": "BUX",

    # Communication / Collab
    "discord": "Discord", "cal": "Cal.com",
    "liveblocks": "Liveblocks", "ably": "Ably", "pusher": "Pusher",
    "novu": "Novu", "knock": "Knock", "courier": "Courier",
    "resend": "Resend", "loops": "Loops", "customer-io": "Customer.io",
    "beehiiv": "beehiiv", "buttondown": "Buttondown",

    # Payments / Commerce
    "paddle": "Paddle", "lemon-squeezy": "Lemon Squeezy",
    "rewardful": "Rewardful", "klaviyo": "Klaviyo",
    "iterable": "Iterable", "braze": "Braze", "attentive": "Attentive",
    "chargebee": "Chargebee", "recurly": "Recurly",
    "faire": "Faire",

    # Sales / CRM
    "clay": "Clay", "attio": "Attio", "close": "Close CRM",
    "apollo": "Apollo", "outreach": "Outreach", "gong": "Gong",
    "salesloft": "Salesloft", "clari": "Clari", "people-ai": "People.ai",

    # Analytics / Growth
    "mixpanel": "Mixpanel", "amplitude": "Amplitude", "segment": "Segment",
    "june": "June", "heap": "Heap", "fullstory": "FullStory",
    "clearbit": "Clearbit", "lusha": "Lusha",

    # HR / People Ops (US)
    "lattice": "Lattice", "checkr": "Checkr",
    "culture-amp": "Culture Amp", "leapsome": "Leapsome",
    "workato": "Workato", "betterworks": "Betterworks",
    "15five": "15Five", "rippling": "Rippling",

    # HR / People Ops (EU)
    "personio": "Personio", "hibob": "HiBob",
    "factorial": "Factorial", "kenjo": "Kenjo",
    "remote-com": "Remote", "workmotion": "WorkMotion",

    # B2B SaaS (EU)
    "celonis": "Celonis", "contentful": "Contentful",
    "commercetools": "commercetools", "pricefx": "Pricefx",
    "babbel": "Babbel", "holidu": "Holidu", "sennder": "sennder",
    "about-you": "About You", "auto1-group": "AUTO1 Group",

    # Healthcare
    "headway": "Headway", "spring-health": "Spring Health",
    "carbon-health": "Carbon Health", "lyra-health": "Lyra Health",
    "ro-health": "Ro", "cerebral": "Cerebral",
    "cityblock": "Cityblock Health", "nuna": "Nuna",
    "included-health": "Included Health",

    # Climate / Sustainability
    "watershed": "Watershed", "arcadia": "Arcadia",
    "pachama": "Pachama", "patch": "Patch",
    "cloverly": "Cloverly", "plan-a": "Plan A",

    # YC recent
    "exa": "Exa", "induced-ai": "Induced AI", "nango": "Nango",
    "merge": "Merge", "trigger-dev": "Trigger.dev",
    "brainrust-data": "Braintrust", "eppo": "Eppo",
    "inngest": "Inngest", "resend": "Resend",

    # Large tech
    "asana": "Asana", "intercom": "Intercom", "zendesk": "Zendesk",
    "duolingo": "Duolingo", "lyft": "Lyft", "reddit": "Reddit",
    "doordash": "DoorDash", "canva": "Canva", "dropbox": "Dropbox",
    "box": "Box", "benchling": "Benchling", "databricks": "Databricks",
    "squarespace": "Squarespace", "wayfair": "Wayfair",
    "trustpilot": "Trustpilot", "templafy": "Templafy",
    "hopin": "Hopin", "multiverse": "Multiverse", "tractable": "Tractable",
    "onfido": "Onfido", "thought-machine": "Thought Machine",
    "graphcore": "Graphcore", "darktrace": "Darktrace",
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
        # ── Fintech / Banking (US) ──────────────────────────────────────────────
        "stripe", "plaid", "brex", "ramp", "affirm", "chime", "robinhood",
        "coinbase", "gusto", "rippling", "mercury", "modern-treasury", "marqeta",
        "deel", "remote", "pilot", "klarna", "checkout",
        "lithic", "synctera", "airbase", "zip-hq", "rho-business", "melio",
        "payoneer", "tipalti", "persona", "alloy", "middesk", "socure", "sardine",
        "clearco", "pipe",
        # ── Communication / Collab ──────────────────────────────────────────────
        "discord", "loom", "miro", "figma", "notion", "airtable", "dropbox",
        "typeform", "coda",
        # ── Infra / Cloud / Networking ──────────────────────────────────────────
        "cloudflare", "fastly", "vercel", "netlify", "railway", "render", "fly-io",
        "tailscale", "temporal", "buildkite", "circleci", "dagger",
        "northflank", "qovery", "porter", "flightcontrol", "koyeb",
        "inngest", "windmill", "pipedream", "encore",
        # ── Observability / Monitoring ──────────────────────────────────────────
        "datadog", "sentry", "pagerduty", "grafana", "honeycomb", "incident-io",
        "rootly", "chronosphere", "axiom", "cribl", "observe", "mezmo",
        "logrocket",
        # ── Databases ───────────────────────────────────────────────────────────
        "supabase", "neon", "cockroachdb", "singlestore", "motherduck",
        "clickhouse", "tinybird", "influxdata", "yugabyte", "questdb",
        "pinecone", "weaviate", "convex", "edgedb",
        # ── Data / Analytics ────────────────────────────────────────────────────
        "dbt-labs", "prefect", "dagster", "astronomer", "airbyte", "fivetran",
        "metabase", "hightouch", "census", "estuary", "hex",
        "lightdash", "sigma-computing", "segment", "mixpanel", "amplitude",
        "monte-carlo-data", "datafold", "coalesce", "preset",
        "contentsquare", "fullstory", "heap", "pendo", "launchdarkly", "statsig",
        # ── AI / ML ─────────────────────────────────────────────────────────────
        "anthropic", "openai", "cohere", "mistral", "groq", "cerebras",
        "scale-ai", "labelbox", "weights-biases", "modal", "replicate",
        "anyscale", "together-ai", "huggingface", "stability-ai",
        "runway", "descript", "elevenlabs", "jasper", "writer-com",
        "baseten", "aleph-alpha", "dust", "vellum", "helicone", "braintrust-data",
        "traceloop", "luma-ai", "synthesia",
        # ── Security ────────────────────────────────────────────────────────────
        "okta", "vanta", "drata", "secureframe", "wiz", "lacework",
        "snyk", "crowdstrike", "sentinelone", "1password", "teleport",
        "abnormal-security", "sublime-security", "jumpcloud",
        "orca-security", "panther-labs", "tines", "torq",
        # ── Dev Tools / Platform ─────────────────────────────────────────────────
        "linear", "retool", "posthog", "sourcegraph", "codeium", "mintlify",
        "readme", "jfrog", "sonatype", "gitpod",
        "speakeasy", "zuplo", "treblle", "apitally",
        "eppo", "growthbook",
        # ── API tooling / infra ───────────────────────────────────────────────────
        "retool", "clerk", "stytch", "temporal", "confluent", "redpanda",
        "materialize", "airbyte", "fivetran", "dagster", "metaplane",
        "hightouch", "census", "rudderstack", "mux", "courier",
        "workos", "novu", "resend", "svix", "hookdeck",
        # ── Auth / Identity ──────────────────────────────────────────────────────
        "clerk", "workos", "stytch", "beyond-identity", "opal", "doppler",
        "propelauth",
        # ── Sales / CRM ──────────────────────────────────────────────────────────
        "gong", "outreach", "apollo", "attio", "clay", "clari", "salesloft",
        # ── HR / Payroll ──────────────────────────────────────────────────────────
        "lattice", "checkr", "culture-amp", "leapsome", "workato",
        "personio", "hibob", "factorial",
        # ── Healthcare ───────────────────────────────────────────────────────────
        "headway", "spring-health", "carbon-health", "lyra-health",
        "cityblock", "nuna", "included-health",
        # ── Climate ──────────────────────────────────────────────────────────────
        "watershed", "arcadia", "pachama", "patch",
        # ── Legal Tech ───────────────────────────────────────────────────────────
        "ironclad",
        # ── Commerce / Marketplace ───────────────────────────────────────────────
        "faire", "clearbit",
        # ── Large tech (verified Greenhouse) ─────────────────────────────────────
        "asana", "intercom", "zendesk", "duolingo", "lyft", "reddit",
        "doordash", "canva", "dropbox", "box", "benchling",
        "squarespace", "etsy", "wayfair", "grubhub", "trustpilot",
        # ── Media / Content / SaaS ───────────────────────────────────────────────
        "twilio", "sendgrid", "elastic", "snowflake", "mongodb", "confluent",
        "databricks",
    ],
    "lever": [
        # ── Big tech / platforms ──────────────────────────────────────────────
        "netflix", "shopify", "gitlab", "hashicorp", "hubspot",
        # ── Infra / Cloud ─────────────────────────────────────────────────────
        "vercel", "netlify", "supabase", "planetscale", "neon",
        "fly", "render", "railway", "depot", "northflank",
        # ── AI / ML ───────────────────────────────────────────────────────────
        "together", "fireworks", "perplexity", "cursor", "codeium",
        "weights-biases", "modal", "replicate", "synthesia", "heygen",
        "read-ai", "fireflies",
        # ── Dev tools ─────────────────────────────────────────────────────────
        "linear", "loom", "miro", "framer", "webflow",
        "retool", "airtable", "coda",
        "posthog", "june",
        "sourcegraph", "mintlify",
        "nango", "merge", "stainless",
        "inngest", "pipedream",
        "launchdarkly", "eppo",
        # ── Auth / Security ───────────────────────────────────────────────────
        "clerk", "workos", "snyk", "teleport", "1password",
        "jumpcloud", "persona",
        # ── Communication ─────────────────────────────────────────────────────
        "cal", "beehiiv", "novu", "courier",
        # ── Sales / Marketing ─────────────────────────────────────────────────
        "gong", "salesloft", "outreach", "apollo",
        "close", "attio", "clay",
        "klaviyo", "iterable", "braze", "attentive", "customer-io",
        # ── Fintech ───────────────────────────────────────────────────────────
        "paddle", "lemon-squeezy", "brex",
        "mercury", "deel", "remote", "ramp",
        "chargebee",
        # ── Data ──────────────────────────────────────────────────────────────
        "airbyte", "fivetran", "estuary", "hightouch", "census",
        "lightdash", "metabase",
        # ── EU Startups (many use Lever) ───────────────────────────────────────
        "revolut", "wise", "n26", "sumup",
        "qonto", "alan", "pennylane",
        "celonis", "contentful", "babbel",
        "hopin", "multiverse",
        # ── HR ────────────────────────────────────────────────────────────────
        "leapsome", "lattice",
        # ── Databases ─────────────────────────────────────────────────────────
        "cockroachdb", "yugabyte", "pinecone", "weaviate", "convex",
        # ── Observability / Incident ──────────────────────────────────────────
        "pagerduty", "incident-io", "firehydrant", "rootly", "blameless",
        "grafana-labs", "honeycomb", "lightstep", "observe", "axiom",
        "tinybird", "clickhouse",
        # ── Databases (new) ───────────────────────────────────────────────────
        "turso", "neon", "planetscale", "supabase", "xata", "fauna",
        "convex", "ditto", "ably", "liveblocks", "partykit",
        # ── API tooling ───────────────────────────────────────────────────────
        "postman",
    ],
    "ashby": [
        # ── Core YC/growth startups ───────────────────────────────────────────
        "linear", "retool", "posthog",
        # ── Data stack ────────────────────────────────────────────────────────
        "dbt-labs", "airbyte", "prefect", "dagster", "mage", "astronomer",
        "hightouch", "census", "lightdash", "coalesce",
        "monte-carlo-data", "datafold",
        # ── Observability ─────────────────────────────────────────────────────
        "grafana", "incident-io", "last9",
        # ── Security / Compliance ──────────────────────────────────────────────
        "vanta", "drata", "secureframe",
        "abnormal-security", "cerbos", "opal", "doppler", "infisical",
        # ── Auth ──────────────────────────────────────────────────────────────
        "clerk", "workos", "stytch",
        # ── Sales / GTM ───────────────────────────────────────────────────────
        "clay", "attio",
        # ── AI / ML tools ─────────────────────────────────────────────────────
        "exa", "induced-ai", "humanloop", "codeium",
        "composio", "e2b", "dust", "vellum", "helicone", "braintrust-data",
        "traceloop", "portkey",
        # ── Integration / API ─────────────────────────────────────────────────
        "nango", "merge", "trigger-dev", "stainless", "speakeasy", "fern-api",
        "inngest", "pipedream",
        # ── Fintech / Billing ─────────────────────────────────────────────────
        "orb", "metronome", "lago", "increase", "column",
        "ramp", "brex",
        # ── Analytics / Experimentation ───────────────────────────────────────
        "june", "mixpanel", "eppo", "statsig", "growthbook",
        "logrocket",
        # ── Dev ───────────────────────────────────────────────────────────────
        "replit", "val-town", "gitpod", "windmill",
        "weaviate", "pinecone", "lancedb", "turbopuffer", "convex",
        # ── Communication ─────────────────────────────────────────────────────
        "resend", "loops", "knock", "novu", "beehiiv",
        # ── Climate / Sustainability ──────────────────────────────────────────
        "watershed", "pachama", "patch",
        # ── Healthcare ────────────────────────────────────────────────────────
        "headway", "spring-health",
        # ── HR ────────────────────────────────────────────────────────────────
        "lattice", "leapsome",
        # ── EU startups on Ashby ──────────────────────────────────────────────
        "qonto", "pennylane", "celonis",
        # ── Streaming / CDC / data infra ──────────────────────────────────────
        "inngest", "trigger-dev", "windmill", "prefect", "dagster",
        "estuary", "meroxa", "decodable", "arcion", "striim",
        "streamkap", "artie", "sequin", "peerdb",
        # ── Analytics / BI ────────────────────────────────────────────────────
        "synmetrix", "cube", "evidence", "lightdash",
        "metabase", "preset", "mode", "sigma", "omni",
    ],
}

# ── Workable slugs ─────────────────────────────────────────────────────────────
# Workable is the dominant ATS in Europe. Many EU startups and scale-ups use it.
WORKABLE_SLUGS = [
    # ── Germany ───────────────────────────────────────────────────────────────
    "personio", "celonis", "contentful", "commercetools", "deepl",
    "babbel", "holidu", "sennder", "getsafe", "taxfix",
    "kreditech", "scalable-capital", "trade-republic", "clark",
    "auto1-group", "about-you", "idealo", "check24",
    # ── Denmark / Nordics ─────────────────────────────────────────────────────
    "pleo", "trustpilot", "templafy", "lunar", "billy",
    "vivino", "funnel", "kry",
    # ── Spain ─────────────────────────────────────────────────────────────────
    "factorial", "cabify", "glovo", "typeform",
    "jobandtalent", "wallbox", "kenjo",
    # ── France ────────────────────────────────────────────────────────────────
    "qonto", "pennylane", "payfit", "alan", "pigment",
    "swile", "ankorstore", "back-market", "contentsquare",
    "doctrine", "meero", "sunday",
    # ── Netherlands ───────────────────────────────────────────────────────────
    "mollie", "bunq", "catawiki", "templafy", "spendesk",
    # ── UK ────────────────────────────────────────────────────────────────────
    "monzo", "revolut", "starling", "wise",
    "multiverse", "tractable", "onfido", "thought-machine",
    "graphcore", "darktrace", "improbable", "gocardless",
    "yapily", "truelayer", "curve", "volt",
    # ── Sweden ────────────────────────────────────────────────────────────────
    "klarna", "funnel", "kry", "hedvig", "einride",
    # ── Belgium / Other EU ────────────────────────────────────────────────────
    "showpad", "teamleader", "deliverect",
    # ── Israel ─────────────────────────────────────────────────────────────────
    "monday", "papaya-global", "lemonade", "walkme",
    "gloat", "hibob", "fiverr",
    # ── Global remote-first startups ─────────────────────────────────────────
    "remote", "deel", "oyster", "doist", "gitlab",
    "automattic", "invision", "mattermost", "basecamp",
    "buffer", "hotjar", "whereby", "toggl",
    "revolut", "hopin",
    # ── US startups also on Workable ──────────────────────────────────────────
    "ironclad", "persona", "watershed", "eppo",
    "cerbos", "inngest", "resend",
    "chargebee", "freshworks", "zendesk",
]

# AI / ML specific
AI_ML_SLUGS = {
    "greenhouse": [
        "anthropic", "openai", "cohere", "ai21-labs", "mistral", "groq", "cerebras",
        "scale-ai", "labelbox", "snorkel-ai",
        "weights-biases", "comet-ml", "modal", "replicate", "anyscale",
        "deepmind", "huggingface", "together-ai",
        "descript", "runway", "pika", "stability-ai", "luma-ai",
        "humanloop", "bentoml", "elevenlabs",
        "arize", "whylabs", "fiddler", "tecton", "chalk",
        "inflection-ai", "adept", "perplexity", "character",
        "lepton-ai", "coreweave", "jasper", "writer-com",
        "baseten", "aleph-alpha", "dust", "vellum", "helicone",
        "braintrust-data", "traceloop", "lightning-ai",
    ],
    "lever": [
        "together", "fireworks", "perplexity", "cursor", "codeium",
        "weights-biases", "modal", "replicate",
        "read-ai", "fireflies", "otter-ai",
        "synthesia", "heygen", "jasper",
        "pinecone", "weaviate",
    ],
    "ashby": [
        "exa", "induced-ai", "humanloop", "composio",
        "codeium", "mintlify", "e2b",
        "lancedb", "turbopuffer", "weaviate", "pinecone",
        "dust", "vellum", "helicone", "braintrust-data",
        "traceloop", "portkey",
    ],
    "workable": [
        "aleph-alpha", "deepl", "synthesia",
        "yepic", "elai",
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
        "pinecone", "weaviate", "convex", "edgedb",
        "inngest", "windmill",
        "kong", "zuplo",
        "ably", "pusher",
    ],
    "lever": [
        "hashicorp", "gitlab",
        "supabase", "planetscale", "neon",
        "fly", "render", "railway", "depot",
        "buildkite",
        "nango", "merge",
        "trigger-dev", "inngest", "pipedream",
        "convex", "weaviate",
    ],
    "ashby": [
        "dbt-labs", "airbyte", "prefect", "dagster",
        "hightouch", "census", "estuary",
        "neon", "turso",
        "trigger-dev", "inngest",
        "last9",
        "convex", "weaviate", "lancedb", "turbopuffer",
    ],
    "workable": [
        "gocardless", "yapily", "truelayer",
        "thought-machine", "starling",
    ],
}

# Frontend / Full-stack
FRONTEND_SLUGS = {
    "greenhouse": [
        "figma", "notion", "airtable", "loom", "miro",
        "vercel", "netlify",
        "webflow", "framer",
        "retool", "coda",
        "linear", "posthog",
        "rows", "tally",
        "logrocket", "fullstory",
    ],
    "lever": [
        "vercel", "netlify", "supabase",
        "linear", "loom", "miro", "framer", "webflow",
        "retool", "airtable", "coda",
        "posthog", "codeium",
        "beehiiv",
    ],
    "ashby": [
        "linear", "posthog", "retool",
        "codeium", "mintlify",
        "resend", "loops",
    ],
    "workable": [
        "multiverse", "hopin", "factorial",
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
        "hashicorp", "northflank", "qovery", "koyeb",
        "inngest", "windmill",
    ],
    "lever": [
        "hashicorp", "gitlab",
        "fly", "render", "railway", "depot",
        "buildkite", "northflank",
    ],
    "ashby": [
        "incident-io", "grafana", "last9",
        "dagger",
    ],
    "workable": [
        "thought-machine", "graphcore",
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
        "monte-carlo-data", "datafold", "coalesce", "preset",
        "contentsquare", "fullstory", "heap", "pendo",
    ],
    "lever": [
        "weights-biases", "lightdash",
        "hightouch", "census",
    ],
    "ashby": [
        "dbt-labs", "airbyte", "prefect", "dagster",
        "hightouch", "census", "lightdash",
        "monte-carlo-data", "datafold",
    ],
    "workable": [
        "funnel", "contentsquare",
    ],
}

# Security / Compliance Engineering
SECURITY_SLUGS = {
    "greenhouse": [
        "wiz", "lacework", "snyk", "crowdstrike", "sentinelone",
        "1password", "teleport", "abnormal-security", "sublime-security",
        "orca-security", "panther-labs", "tines", "torq",
        "vanta", "drata", "secureframe", "jumpcloud",
        "persona", "alloy", "socure", "onfido",
        "cerbos", "opal", "doppler",
    ],
    "lever": [
        "snyk", "teleport", "1password",
        "jumpcloud", "persona",
    ],
    "ashby": [
        "vanta", "drata", "secureframe",
        "abnormal-security", "opal", "doppler", "infisical", "cerbos",
    ],
    "workable": [
        "onfido", "darktrace",
    ],
}


def _select_slugs(profile: Dict) -> Dict[str, List[str]]:
    """
    Pick relevant ATS slug subsets based on the user's role and skills.
    Always starts with universal slugs, then adds role-specific ones.
    Deduplicates across categories. Workable always uses full list (EU-focused).
    """
    role = (profile.get("role") or "").lower()
    skills = [s.lower() for s in (profile.get("skills") or [])]
    skills_str = " ".join(skills)

    selected: Dict[str, Set[str]] = {
        "greenhouse": set(UNIVERSAL_SLUGS["greenhouse"]),
        "lever":      set(UNIVERSAL_SLUGS["lever"]),
        "ashby":      set(UNIVERSAL_SLUGS["ashby"]),
        "workable":   set(WORKABLE_SLUGS),           # always full list for EU coverage
    }

    def _add(category_slugs: Dict[str, List[str]]):
        for ats, slugs in category_slugs.items():
            if ats in selected:
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

    # Security / Compliance
    if any(x in role for x in ["security", "appsec", "devsecops", "soc", "grc", "compliance"]) or \
       any(x in skills_str for x in ["soc2", "gdpr", "pentest", "security", "vulnerability", "siem"]):
        _add(SECURITY_SLUGS)

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
    keywords: List[str], role_keywords: List[str] = None, profile: dict = None
) -> List[Dict]:
    try:
        resp = await client.get(
            f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
            params={"content": "true"},
            timeout=10,
        )
        if resp.status_code == 404:
            return []  # slug doesn't exist — skip silently
        if resp.status_code != 200:
            return []
        data = resp.json()
        jobs = []
        for job in data.get("jobs", []):
            if not is_within_days(job.get("updated_at")):
                continue
            title = job.get("title", "")
            location = ""
            for loc in job.get("offices", []):
                location = loc.get("name", "")
                break
            if not is_location_ok(location, profile):
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
    keywords: List[str], role_keywords: List[str] = None, profile: dict = None
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
            if not is_within_days(job.get("createdAt")):
                continue
            title = job.get("text", "")
            categories = job.get("categories", {})
            location = categories.get("location", "Remote")
            description = job.get("descriptionPlain", "") or job.get("description", "")
            if not is_location_ok(location, profile):
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
    keywords: List[str], role_keywords: List[str] = None, profile: dict = None
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
            if not is_within_days(job.get("publishedAt")):
                continue
            title = job.get("title", "")
            team = job.get("teamName", "")
            location = job.get("locationName", "Remote")
            if not is_location_ok(location, profile):
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


# ── Workable fetcher ──────────────────────────────────────────────────────────

async def _fetch_workable_company(
    client: httpx.AsyncClient, slug: str,
    keywords: List[str], role_keywords: List[str] = None, profile: dict = None
) -> List[Dict]:
    """Workable public job board API — popular with EU startups."""
    try:
        resp = await client.get(
            f"https://apply.workable.com/api/v3/accounts/{slug}/jobs",
            timeout=10,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        jobs = []
        for job in data.get("results", []):
            if job.get("state", "").lower() != "published":
                continue
            if not is_within_days(job.get("created_at")):
                continue
            title = job.get("title", "")
            loc = job.get("location", {})
            city = loc.get("city") or loc.get("region") or ""
            country = loc.get("country", "")
            is_remote = job.get("remote", False)
            location = "Remote" if is_remote else f"{city}, {country}".strip(", ") or "Remote"
            if not is_location_ok(location, profile):
                continue
            if not _is_relevant(title, "", keywords, role_keywords):
                continue
            shortcode = job.get("shortcode", "")
            url = f"https://apply.workable.com/{slug}/j/{shortcode}" if shortcode else ""
            if not url:
                continue
            dept = job.get("department", "")
            jobs.append({
                "title": title,
                "company_name": _company_name(slug),
                "company_website": f"https://apply.workable.com/{slug}",
                "description": "",
                "location": location,
                "salary_range": "",
                "job_type": (job.get("employment_type") or "full-time").lower(),
                "source": "workable",
                "source_url": url,
                "tags": [dept] if dept else [],
                "dedup_key": _dedup_key(slug, title),
            })
        return jobs
    except Exception:
        return []


# ── Main entry point ──────────────────────────────────────────────────────────

async def fetch_ats_jobs(profile: dict) -> List[Dict]:
    """
    Fetch jobs from Greenhouse, Lever, Ashby, and Workable
    for companies relevant to this profile.
    Uses role-aware slug selection to avoid hitting irrelevant companies.
    """
    role = (profile.get("role") or "").lower()
    skill_tokens = extract_skill_keywords(profile.get("skills") or [])
    keywords = skill_tokens + ([role] if role else [])
    keywords = [k for k in keywords if k]

    stop_words = {"and", "or", "the", "for", "with", "from", "senior", "junior",
                  "lead", "staff", "principal", "associate", "remote"}
    role_keywords = [w for w in role.split() if len(w) > 2 and w not in stop_words]

    if not keywords:
        return []

    # Select only relevant company slugs for this profile
    slug_sets = _select_slugs(profile)
    greenhouse_slugs = slug_sets["greenhouse"]
    lever_slugs      = slug_sets["lever"]
    ashby_slugs      = slug_sets["ashby"]
    workable_slugs   = slug_sets["workable"]

    print(
        f"ATS: {len(greenhouse_slugs)} Greenhouse + {len(lever_slugs)} Lever + "
        f"{len(ashby_slugs)} Ashby + {len(workable_slugs)} Workable companies"
    )

    all_jobs: List[Dict] = []
    seen_keys: set = set()

    def _collect(results):
        for result in results:
            if isinstance(result, list):
                for job in result:
                    key = job.get("dedup_key", "")
                    if key and key not in seen_keys and job.get("source_url"):
                        seen_keys.add(key)
                        all_jobs.append(job)

    limits = httpx.Limits(max_connections=60, max_keepalive_connections=30)
    async with httpx.AsyncClient(limits=limits) as client:
        # All four ATSs in parallel
        gh_results, lever_results, ashby_results, workable_results = await asyncio.gather(
            asyncio.gather(*[_fetch_greenhouse_company(client, s, keywords, role_keywords, profile) for s in greenhouse_slugs], return_exceptions=True),
            asyncio.gather(*[_fetch_lever_company(client, s, keywords, role_keywords, profile)      for s in lever_slugs],      return_exceptions=True),
            asyncio.gather(*[_fetch_ashby_company(client, s, keywords, role_keywords, profile)      for s in ashby_slugs],      return_exceptions=True),
            asyncio.gather(*[_fetch_workable_company(client, s, keywords, role_keywords, profile)   for s in workable_slugs],   return_exceptions=True),
        )

        _collect(gh_results)
        _collect(lever_results)
        _collect(ashby_results)
        _collect(workable_results)

    print(f"ATS total: {len(all_jobs)} relevant jobs")
    return all_jobs
