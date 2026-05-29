import os
import httpx
import asyncio
import hashlib
from typing import List, Dict, Optional
from dotenv import load_dotenv
from services.date_utils import is_within_days, is_location_ok, extract_skill_keywords

load_dotenv()

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")

# Locations that are acceptable (USA, Canada, Remote, Worldwide)
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
    "sydney", "melbourne", "brisbane", "perth",
    "hyderabad", "bangalore", "bengaluru", "mumbai", "delhi", "pune", "chennai",
    "lisbon", "porto", "tel aviv", "israel",
    "london", "berlin", "amsterdam", "paris", "stockholm", "dublin",
    "kiev", "kyiv", "warsaw", "prague",
    "hong kong", "taipei", "seoul", "tokyo", "bangkok", "jakarta",
    "dubai", "uae", "saudi", "lagos", "nairobi",
}

_STOP_WORDS = {"and", "or", "the", "for", "with", "from", "senior", "junior",
               "lead", "staff", "principal", "associate", "remote", "full", "time"}


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
    return False  # default block unknown locations


def _dedup_key(company_name: str, title: str) -> str:
    raw = f"{company_name.lower().strip()}{title.lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _build_keyword_sets(profile: Dict):
    role = (profile.get("role") or "").lower()
    role_keywords = [w for w in role.split() if len(w) > 2 and w not in _STOP_WORDS]
    if not role_keywords and role:
        role_keywords = [role]
    skill_keywords = extract_skill_keywords(profile.get("skills") or [])
    return role_keywords, skill_keywords


def _is_relevant_job(title: str, description: str, tags: List[str],
                     role_keywords: List[str], skill_keywords: List[str]) -> bool:
    """
    Shared relevance check. Passes if:
      - Role keyword in job title, OR
      - At least 2 profile skills anywhere in title+tags+description
    """
    title_l = title.lower()
    desc_l = (description or "")[:800].lower()
    tags_l = " ".join(t.lower() for t in (tags or []))
    combined = f"{title_l} {tags_l} {desc_l}"

    if any(kw in title_l for kw in role_keywords):
        return True

    skill_hits = sum(1 for s in skill_keywords if s in combined)
    return skill_hits >= 2


# ── Remotive ──────────────────────────────────────────────────────────────────

# Targeted queries run against category=software-dev for precise coverage
REMOTIVE_QUERIES = [
    "java backend",
    "golang backend",
    "kafka",
    "api platform",
    "backend infrastructure",
    "platform engineer",
    "fintech backend",
    "data pipeline",
]


async def _fetch_remotive_query(
    client: httpx.AsyncClient,
    query: str,
    profile: Dict,
    role_keywords: List[str],
    skill_keywords: List[str],
) -> List[Dict]:
    """Fetch one Remotive query with category=software-dev."""
    results   = []
    seen_keys = set()
    try:
        resp = await client.get(
            "https://remotive.com/api/remote-jobs",
            params={"category": "software-dev", "search": query, "limit": 50},
            timeout=20,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        for job in data.get("jobs", []):
            if not is_within_days(job.get("publication_date")):
                continue

            location = job.get("candidate_required_location", "") or ""
            # Allow empty location (worldwide) or locations that don't exclude India
            if location:
                loc_l = location.lower()
                # Reject only explicitly country-restricted listings that exclude remote India
                hard_blocks = {"india only", "uk only", "europe only", "us only", "usa only",
                               "australia only", "germany only"}
                if any(b in loc_l for b in hard_blocks):
                    continue
                # Keep: empty, "Worldwide", "Remote", "Global", or any timezone-based
                allowed_signals = {"remote", "worldwide", "global", "anywhere",
                                   "us", "usa", "canada", "north america", "utc", "est", "pst"}
                if not any(sig in loc_l for sig in allowed_signals):
                    # Unknown location — still allow; LLM will filter
                    pass

            title       = job.get("title", "")
            description = job.get("description", "")
            tags        = job.get("tags", [])

            if not _is_relevant_job(title, description, tags, role_keywords, skill_keywords):
                continue

            key = _dedup_key(job.get("company_name", ""), title)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            results.append({
                "title":           title,
                "company_name":    job.get("company_name", ""),
                "company_website": job.get("company_logo", ""),
                "description":     description,
                "location":        location or "Remote",
                "salary_range":    job.get("salary", ""),
                "job_type":        job.get("job_type", ""),
                "source":          "remotive",
                "source_url":      job.get("url", ""),
                "tags":            tags,
                "dedup_key":       key,
            })
    except Exception as e:
        print(f"Remotive error for query '{query}': {e}")
    return results


async def fetch_remotive(queries: List[Dict], profile: Dict) -> List[Dict]:
    """
    Fetch from Remotive with targeted software-dev category queries.
    Runs REMOTIVE_QUERIES in parallel (ignores the generic 'queries' param
    in favour of role-specific queries).
    """
    role_keywords, skill_keywords = _build_keyword_sets(profile)
    seen_keys  = set()
    all_jobs   = []

    async with httpx.AsyncClient(timeout=30) as client:
        page_results = await asyncio.gather(
            *[_fetch_remotive_query(client, q, profile, role_keywords, skill_keywords)
              for q in REMOTIVE_QUERIES],
            return_exceptions=True,
        )

    for page in page_results:
        if isinstance(page, Exception):
            print(f"Remotive page error: {page}")
            continue
        for job in page:
            key = job.get("dedup_key", "")
            if key and key not in seen_keys:
                seen_keys.add(key)
                all_jobs.append(job)

    print(f"Remotive: {len(all_jobs)} relevant jobs")
    return all_jobs


# ── Arbeitnow ─────────────────────────────────────────────────────────────────

async def fetch_arbeitnow(queries: List[Dict], profile: Dict) -> List[Dict]:
    """
    Arbeitnow free job board API.
    Fetches all 7 pages (~700 total jobs). Each page has ~7-14 remote-eligible jobs
    that survive the location filter, so all 7 pages are needed for decent coverage.
    NOTE: Arbeitnow's API does not support text search params — filtering is done
    entirely via _is_relevant_job after fetching.
    """
    role_keywords, skill_keywords = _build_keyword_sets(profile)
    results = []
    seen_keys = set()

    async with httpx.AsyncClient(timeout=30) as client:
        for page in range(1, 8):  # pages 1–7
            try:
                resp = await client.get(
                    "https://www.arbeitnow.com/api/job-board-api",
                    params={"page": page},
                )
                if resp.status_code != 200:
                    break
                data = resp.json()
                jobs = data.get("data", [])
                if not jobs:
                    break

                for job in jobs:
                    if not is_within_days(job.get("created_at")):
                        continue
                    location = job.get("location", "Remote")
                    if not is_location_ok(location, profile):
                        continue

                    title = job.get("title", "")
                    description = job.get("description", "")
                    tags = job.get("tags", [])

                    if not _is_relevant_job(title, description, tags, role_keywords, skill_keywords):
                        continue

                    key = _dedup_key(job.get("company_name", ""), title)
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)
                    results.append({
                        "title": title,
                        "company_name": job.get("company_name", ""),
                        "company_website": "",
                        "description": description,
                        "location": location,
                        "salary_range": "",
                        "job_type": "full-time" if job.get("remote") else job.get("employment_type", ""),
                        "source": "arbeitnow",
                        "source_url": job.get("url", ""),
                        "tags": tags,
                        "dedup_key": key,
                    })
            except Exception as e:
                print(f"Arbeitnow page {page} error: {e}")
                break

    return results


# ── JSearch (RapidAPI) ────────────────────────────────────────────────────────

async def fetch_jsearch(profile: Dict) -> List[Dict]:
    if not RAPIDAPI_KEY:
        return []

    role = profile.get("role", "")
    skills = profile.get("skills", [])
    top_skills = skills[:5] if skills else []
    role_keywords, skill_keywords = _build_keyword_sets(profile)

    results = []
    seen_keys = set()

    async with httpx.AsyncClient(timeout=30) as client:
        for page in range(1, 4):
            try:
                query = f"{role} remote {' '.join(top_skills[:3])}"
                resp = await client.get(
                    "https://jsearch.p.rapidapi.com/search",
                    params={
                        "query": query,
                        "page": str(page),
                        "num_pages": "1",
                        "date_posted": "month",
                        "remote_jobs_only": "true",
                    },
                    headers={
                        "X-RapidAPI-Key": RAPIDAPI_KEY,
                        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
                    },
                )
                if resp.status_code != 200:
                    break
                data = resp.json()
                jobs = data.get("data", [])
                if not jobs:
                    break

                for job in jobs:
                    location = job.get("job_city") or job.get("job_country") or "Remote"
                    if not is_location_ok(location, profile):
                        continue

                    title = job.get("job_title", "")
                    description = job.get("job_description", "")

                    if not _is_relevant_job(title, description, [], role_keywords, skill_keywords):
                        continue

                    key = _dedup_key(job.get("employer_name", ""), title)
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)

                    salary_parts = []
                    if job.get("job_min_salary"):
                        salary_parts.append(f"${job['job_min_salary']:,.0f}")
                    if job.get("job_max_salary"):
                        salary_parts.append(f"${job['job_max_salary']:,.0f}")

                    results.append({
                        "title": title,
                        "company_name": job.get("employer_name", ""),
                        "company_website": job.get("employer_website", ""),
                        "description": description,
                        "location": location,
                        "salary_range": " - ".join(salary_parts),
                        "job_type": job.get("job_employment_type", ""),
                        "source": "jsearch",
                        "source_url": job.get("job_apply_link", ""),
                        "tags": [],
                        "dedup_key": key,
                    })
            except Exception as e:
                print(f"JSearch page {page} error: {e}")
                break

    return results


# ── Remoteok ──────────────────────────────────────────────────────────────────

async def fetch_remoteok(profile: Dict) -> List[Dict]:
    """
    Remoteok public API — excellent startup + remote coverage, no auth needed.
    https://remoteok.com/api?tags=python,react

    Remoteok tags are single lowercase words. We map profile skills to valid tags.
    Runs 2 queries: one skill-based, one role-based.
    """
    role_keywords, skill_keywords = _build_keyword_sets(profile)
    skills = profile.get("skills", [])
    role = (profile.get("role") or "").strip()

    results = []
    seen_keys = set()
    seen_job_ids: set = set()

    # Build skill tags: only single-word skills map cleanly to Remoteok tags
    skill_tags = []
    for s in skills[:6]:
        s_lower = s.lower().strip()
        # Multi-word skills like "machine learning" won't match Remoteok tags well
        if " " not in s_lower:
            skill_tags.append(s_lower)

    # Build role tag: "backend engineer" → "backend"
    role_tag = ""
    role_lower = role.lower()
    for keyword in ["backend", "frontend", "fullstack", "devops", "mobile", "ios",
                    "android", "python", "react", "golang", "rust", "java", "scala"]:
        if keyword in role_lower:
            role_tag = keyword
            break
    if not role_tag and role_keywords:
        role_tag = role_keywords[0]

    # Queries to try
    queries_to_try = []
    if skill_tags:
        queries_to_try.append(",".join(skill_tags[:3]))
    if role_tag and role_tag not in ",".join(skill_tags[:3]):
        queries_to_try.append(role_tag)

    async with httpx.AsyncClient(
        timeout=30,
        headers={"User-Agent": "JobCRM/1.0 (personal job tracker)"},
    ) as client:
        for tag_query in queries_to_try[:2]:
            try:
                resp = await client.get(
                    "https://remoteok.com/api",
                    params={"tags": tag_query},
                )
                if resp.status_code != 200:
                    continue

                data = resp.json()
                for job in data:
                    if not isinstance(job, dict) or "position" not in job:
                        continue  # skip legal notice and non-job items
                    if not is_within_days(job.get("date")):
                        continue

                    job_id = str(job.get("id", ""))
                    if job_id in seen_job_ids:
                        continue
                    seen_job_ids.add(job_id)

                    title = job.get("position", "")
                    company = job.get("company", "")
                    description = job.get("description", "")

                    tags = job.get("tags") or []
                    if isinstance(tags, str):
                        tags = [t.strip() for t in tags.split(",") if t.strip()]

                    if not _is_relevant_job(title, description, tags, role_keywords, skill_keywords):
                        continue

                    key = _dedup_key(company, title)
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)

                    # Salary
                    salary = ""
                    sal_min = job.get("salary_min")
                    sal_max = job.get("salary_max")
                    if sal_min and sal_max:
                        try:
                            salary = f"${int(sal_min):,} - ${int(sal_max):,}"
                        except (ValueError, TypeError):
                            pass
                    elif sal_min:
                        try:
                            salary = f"${int(sal_min):,}+"
                        except (ValueError, TypeError):
                            pass

                    source_url = job.get("url") or job.get("apply_url") or ""
                    if not source_url and job_id:
                        source_url = f"https://remoteok.com/l/{job_id}"

                    if not source_url:
                        continue

                    results.append({
                        "title": title,
                        "company_name": company,
                        "company_website": job.get("company_logo", ""),
                        "description": description,
                        "location": "Remote",
                        "salary_range": salary,
                        "job_type": "full-time",
                        "source": "remoteok",
                        "source_url": source_url,
                        "tags": tags,
                        "dedup_key": key,
                    })

            except Exception as e:
                print(f"Remoteok error (tags={tag_query}): {e}")

    return results


# ── Aggregator ────────────────────────────────────────────────────────────────

async def fetch_all_jobs(profile: Dict, queries: List[Dict]) -> List[Dict]:
    remotive_jobs, arbeitnow_jobs, jsearch_jobs, remoteok_jobs = await asyncio.gather(
        fetch_remotive(queries, profile),
        fetch_arbeitnow(queries, profile),
        fetch_jsearch(profile),
        fetch_remoteok(profile),
        return_exceptions=True,
    )

    all_jobs = []
    seen_keys = set()

    for source_jobs in [remotive_jobs, arbeitnow_jobs, jsearch_jobs, remoteok_jobs]:
        if isinstance(source_jobs, Exception):
            print(f"Source error: {source_jobs}")
            continue
        for job in source_jobs:
            key = job.get("dedup_key", _dedup_key(job.get("company_name", ""), job.get("title", "")))
            if key not in seen_keys and job.get("source_url"):
                seen_keys.add(key)
                all_jobs.append(job)

    return all_jobs
