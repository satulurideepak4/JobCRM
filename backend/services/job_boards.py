import os
import httpx
import asyncio
import hashlib
from typing import List, Dict, Optional
from dotenv import load_dotenv

load_dotenv()

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")

# Locations that are acceptable (USA, Canada, Remote, Worldwide)
ALLOWED_LOCATIONS = {
    "remote", "worldwide", "anywhere", "global", "us", "usa", "united states",
    "canada", "north america", "us/canada", "usa/canada",
    # US timezones
    "est", "cst", "mst", "pst", "pt", "ct", "mt", "et",
    "eastern", "central", "mountain", "pacific",
    "utc-4", "utc-5", "utc-6", "utc-7", "utc-8",
    "new york", "san francisco", "seattle", "austin", "chicago",
    "los angeles", "boston", "denver", "atlanta", "miami",
    "toronto", "vancouver", "montreal",
}

# Locations to explicitly exclude
BLOCKED_LOCATIONS = {
    "uk", "united kingdom", "europe", "eu", "germany", "france", "spain",
    "netherlands", "sweden", "norway", "denmark", "finland", "poland",
    "australia", "new zealand", "india", "china", "japan", "singapore",
    "brazil", "mexico", "argentina", "latin america", "apac", "emea",
}

# Stop words that don't help with matching
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
    # Unknown locations — allow by default; local_filter acts as final gate
    return True


def _dedup_key(company_name: str, title: str) -> str:
    raw = f"{company_name.lower().strip()}{title.lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _build_keyword_sets(profile: Dict):
    """
    Returns (role_keywords, skill_keywords) from a profile dict.
    role_keywords: meaningful words from the role string
    skill_keywords: all skills lowercased
    """
    role = (profile.get("role") or "").lower()
    skills = [s.lower().strip() for s in (profile.get("skills") or []) if s]

    role_keywords = [w for w in role.split() if len(w) > 2 and w not in _STOP_WORDS]
    if not role_keywords and role:
        role_keywords = [role]

    return role_keywords, skills


def _is_relevant_job(title: str, description: str, tags: List[str],
                     role_keywords: List[str], skill_keywords: List[str]) -> bool:
    """
    Shared relevance check used by all scrapers.
    Passes if:
      - Role keyword appears in the job title, OR
      - At least 2 profile skill keywords appear anywhere in title+tags+description
    This catches both exact-role matches and adjacent-skill matches.
    """
    title_l = title.lower()
    desc_l = (description or "")[:800].lower()
    tags_l = " ".join(t.lower() for t in (tags or []))
    combined = f"{title_l} {tags_l} {desc_l}"

    if any(kw in title_l for kw in role_keywords):
        return True

    skill_hits = sum(1 for s in skill_keywords if s in combined)
    return skill_hits >= 2


async def fetch_remotive(queries: List[Dict], profile: Dict) -> List[Dict]:
    role_keywords, skill_keywords = _build_keyword_sets(profile)
    results = []
    seen_keys = set()

    async with httpx.AsyncClient(timeout=30) as client:
        for query_obj in queries:
            query = query_obj.get("query", "")
            try:
                resp = await client.get(
                    "https://remotive.com/api/remote-jobs",
                    params={"search": query, "limit": 100},
                )
                if resp.status_code != 200:
                    continue
                data = resp.json()
                for job in data.get("jobs", []):
                    location = job.get("candidate_required_location", "Remote")
                    if not _is_allowed_location(location):
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
                        "company_website": job.get("company_logo", ""),
                        "description": description,
                        "location": location,
                        "salary_range": job.get("salary", ""),
                        "job_type": job.get("job_type", ""),
                        "source": "remotive",
                        "source_url": job.get("url", ""),
                        "tags": tags,
                        "dedup_key": key,
                    })
            except Exception as e:
                print(f"Remotive error for query '{query}': {e}")

    return results


async def fetch_arbeitnow(queries: List[Dict], profile: Dict) -> List[Dict]:
    role_keywords, skill_keywords = _build_keyword_sets(profile)
    results = []
    seen_keys = set()

    async with httpx.AsyncClient(timeout=30) as client:
        for page in range(1, 8):
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
                    location = job.get("location", "Remote")
                    if not _is_allowed_location(location):
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


async def fetch_jsearch(profile: Dict) -> List[Dict]:
    if not RAPIDAPI_KEY:
        print("RAPIDAPI_KEY not set, skipping JSearch")
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
                    if not _is_allowed_location(location):
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


async def fetch_all_jobs(profile: Dict, queries: List[Dict]) -> List[Dict]:
    remotive_jobs, arbeitnow_jobs, jsearch_jobs = await asyncio.gather(
        fetch_remotive(queries, profile),
        fetch_arbeitnow(queries, profile),
        fetch_jsearch(profile),
        return_exceptions=True,
    )

    all_jobs = []
    seen_keys = set()

    for source_jobs in [remotive_jobs, arbeitnow_jobs, jsearch_jobs]:
        if isinstance(source_jobs, Exception):
            print(f"Source error: {source_jobs}")
            continue
        for job in source_jobs:
            key = job.get("dedup_key", _dedup_key(job.get("company_name", ""), job.get("title", "")))
            if key not in seen_keys and job.get("source_url"):
                seen_keys.add(key)
                all_jobs.append(job)

    return all_jobs
