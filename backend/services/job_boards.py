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


def _is_allowed_location(location: str) -> bool:
    if not location:
        return True
    loc = location.lower().strip()
    if any(blocked in loc for blocked in BLOCKED_LOCATIONS):
        return False
    if any(allowed in loc for allowed in ALLOWED_LOCATIONS):
        return True
    # If location mentions "remote" anywhere, allow it
    if "remote" in loc:
        return True
    # Unknown locations - allow by default (better to over-include)
    return True


def _dedup_key(company_name: str, title: str) -> str:
    raw = f"{company_name.lower().strip()}{title.lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()


async def fetch_remotive(queries: List[Dict]) -> List[Dict]:
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
                    key = _dedup_key(job.get("company_name", ""), job.get("title", ""))
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)
                    results.append({
                        "title": job.get("title", ""),
                        "company_name": job.get("company_name", ""),
                        "company_website": job.get("company_logo", ""),
                        "description": job.get("description", ""),
                        "location": location,
                        "salary_range": job.get("salary", ""),
                        "job_type": job.get("job_type", ""),
                        "source": "remotive",
                        "source_url": job.get("url", ""),
                        "tags": job.get("tags", []),
                        "dedup_key": key,
                    })
            except Exception as e:
                print(f"Remotive error for query '{query}': {e}")

    return results


async def fetch_arbeitnow(queries: List[Dict], profile_keywords: List[str]) -> List[Dict]:
    results = []
    seen_keys = set()
    keywords_lower = [k.lower() for k in profile_keywords]

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

                    title_lower = job.get("title", "").lower()
                    desc_lower = job.get("description", "").lower()
                    combined = f"{title_lower} {desc_lower}"

                    # Looser filter: match in title OR at least one keyword anywhere
                    title_match = any(kw in title_lower for kw in keywords_lower)
                    desc_match = sum(1 for kw in keywords_lower if kw in combined) >= 1
                    if not title_match and not desc_match:
                        continue

                    key = _dedup_key(job.get("company_name", ""), job.get("title", ""))
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)
                    results.append({
                        "title": job.get("title", ""),
                        "company_name": job.get("company_name", ""),
                        "company_website": "",
                        "description": job.get("description", ""),
                        "location": location,
                        "salary_range": "",
                        "job_type": "full-time" if job.get("remote") else job.get("employment_type", ""),
                        "source": "arbeitnow",
                        "source_url": job.get("url", ""),
                        "tags": job.get("tags", []),
                        "dedup_key": key,
                    })
            except Exception as e:
                print(f"Arbeitnow page {page} error: {e}")
                break

    return results


async def fetch_jsearch(role: str, top_skills: List[str]) -> List[Dict]:
    if not RAPIDAPI_KEY:
        print("RAPIDAPI_KEY not set, skipping JSearch")
        return []

    results = []
    seen_keys = set()

    async with httpx.AsyncClient(timeout=30) as client:
        for page in range(1, 4):
            try:
                query = f"{role} remote {' '.join(top_skills[:3])}"
                resp = await client.get(
                    "https://jsearch.p.rapidapi.com/search",
                    params={"query": query, "page": str(page), "num_pages": "1", "date_posted": "month", "remote_jobs_only": "true"},
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
                    key = _dedup_key(job.get("employer_name", ""), job.get("job_title", ""))
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)

                    salary_parts = []
                    if job.get("job_min_salary"):
                        salary_parts.append(f"${job['job_min_salary']:,.0f}")
                    if job.get("job_max_salary"):
                        salary_parts.append(f"${job['job_max_salary']:,.0f}")

                    results.append({
                        "title": job.get("job_title", ""),
                        "company_name": job.get("employer_name", ""),
                        "company_website": job.get("employer_website", ""),
                        "description": job.get("job_description", ""),
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
    role = profile.get("role", "")
    skills = profile.get("skills", [])
    top_skills = skills[:5] if skills else []

    remotive_jobs, arbeitnow_jobs, jsearch_jobs = await asyncio.gather(
        fetch_remotive(queries),
        fetch_arbeitnow(queries, top_skills),
        fetch_jsearch(role, top_skills),
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
