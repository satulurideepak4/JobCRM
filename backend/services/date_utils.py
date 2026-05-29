"""
Shared utilities for all job board fetchers:
  - is_within_days       : 20-day date filter
  - is_location_ok       : profile-driven location filter
  - extract_skill_keywords: normalize multi-word skills for matching
"""
import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Dict, List, Optional


def extract_skill_keywords(skills: List[str]) -> List[str]:
    """
    Normalize profile skills into individual matchable tokens.

    "Java 17"      → ["java"]          (version numbers dropped)
    "Spring Boot"  → ["spring", "boot"]
    "Apache Kafka" → ["apache", "kafka"]
    "RESTful APIs" → ["restful", "apis"]
    "AWS S3"       → ["aws", "s3"]
    "CI/CD"        → ["ci", "cd"]
    "Go"           → ["go"]

    This ensures "java 17" in profile matches "Java" in job descriptions.
    """
    _drop = {"and", "or", "the", "for", "with", "api", "a", "an"}
    result = set()
    for skill in skills:
        tokens = re.split(r"[\s/\-]+", skill.lower().strip())
        for tok in tokens:
            tok = re.sub(r"[^a-z0-9#+.]", "", tok)
            if len(tok) >= 2 and not tok.isdigit() and tok not in _drop:
                result.add(tok)
    return list(result)


# Locations that are always blocked regardless of profile — these appear in
# job listings but are never acceptable as remote/global positions.
_HARD_BLOCKED = {
    # India — must be hard-blocked so "Remote India" is still rejected
    "india", "hyderabad", "bangalore", "bengaluru", "mumbai", "delhi", "pune", "chennai",
    # Australia / NZ
    "australia", "sydney", "melbourne", "brisbane", "perth", "new south wales",
    "queensland", "victoria", "western australia", "new zealand",
    # Ireland / UK
    "ireland", "london", "manchester", "edinburgh", "glasgow",
    # China
    "china", "beijing", "shanghai", "shenzhen",
    # SE Asia
    "thailand", "bangkok", "indonesia", "jakarta", "philippines", "manila", "ho chi minh", "vietnam",
    # Africa / Middle East
    "lagos", "nairobi", "cairo", "johannesburg", "dubai", "uae", "saudi",
    # Other EU cities not in allowed list
    "lisbon", "porto", "tel aviv", "israel", "warsaw", "kyiv", "kiev", "prague", "bucharest",
}


def is_location_ok(location: str, profile: Optional[Dict] = None) -> bool:
    """
    Return True if the job location matches the user's preferences.

    Logic (in order):
      1. Empty location → allow (assume remote).
      2. Hard-blocked cities → always reject.
      3. If profile has `preferred_locations` (e.g. "US, Remote, Europe"):
           - parse into tokens and check substring match.
      4. If profile has `remote_only=True`: only allow if location contains "remote".
      5. Fallback: reject if location doesn't contain "remote" or a known
         US/Canada/worldwide keyword — prevents unknown cities slipping through.
    """
    if not location:
        return True

    loc = location.lower().strip()

    # Step 2: hard-blocked cities
    if any(city in loc for city in _HARD_BLOCKED):
        return False

    prefs = (profile or {}).get("preferences", {}) if profile else {}

    # Step 3: user has set explicit preferred locations
    preferred_raw = (prefs.get("preferred_locations") or "").strip()
    if preferred_raw:
        tokens = [t.strip().lower() for t in preferred_raw.split(",") if t.strip()]
        if any(t in loc for t in tokens):
            return True
        # "remote" is always valid if they listed it
        if "remote" in tokens and "remote" in loc:
            return True
        return False

    # Step 4: remote_only preference
    if prefs.get("remote_only"):
        return "remote" in loc

    # Step 5: default fallback — allow remote/worldwide/US/Canada, block the rest
    _DEFAULT_ALLOWED = {
        "remote", "worldwide", "anywhere", "global",
        "us", "usa", "united states", "canada", "north america",
        "est", "cst", "mst", "pst", "eastern", "central", "mountain", "pacific",
        "new york", "san francisco", "seattle", "austin", "chicago",
        "los angeles", "boston", "denver", "atlanta", "miami",
        "toronto", "vancouver", "montreal",
    }
    _DEFAULT_BLOCKED = {
        "uk", "united kingdom", "europe", "eu", "germany", "france", "spain",
        "netherlands", "sweden", "norway", "denmark", "finland", "poland",
        "australia", "new zealand", "india", "china", "japan", "singapore",
        "brazil", "mexico", "argentina", "latin america", "apac", "emea",
        "lisbon", "porto", "tel aviv", "israel",
        "london", "berlin", "amsterdam", "paris", "stockholm", "dublin",
        "kiev", "kyiv", "warsaw", "prague",
        "hong kong", "taipei", "seoul", "tokyo",
        "dubai", "uae", "saudi",
    }
    if any(b in loc for b in _DEFAULT_BLOCKED):
        return False
    if any(a in loc for a in _DEFAULT_ALLOWED):
        return True
    if "remote" in loc:
        return True
    return False  # unknown location → reject

FETCH_DAYS = 20


def is_within_days(date_value, days: int = FETCH_DAYS) -> bool:
    """
    Return True if date_value falls within the last `days` days.

    Accepts:
      - Unix timestamps as int/float (seconds or milliseconds auto-detected)
      - ISO-8601 strings  ("2024-01-15T10:30:00Z" / "2024-01-15")
      - RFC-2822 strings  ("Mon, 15 Jan 2024 10:30:00 +0000")

    Returns True when the date cannot be parsed (allow-through default).
    """
    if not date_value:
        return True

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    try:
        if isinstance(date_value, (int, float)):
            ts = date_value / 1000 if date_value > 1_000_000_000_000 else date_value
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        elif isinstance(date_value, str):
            try:
                dt = parsedate_to_datetime(date_value)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            except Exception:
                clean = date_value.replace("Z", "").split("+")[0].split(".")[0][:19]
                dt = datetime.strptime(clean, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        else:
            return True

        return dt >= cutoff

    except Exception:
        return True  # unknown format → allow through
