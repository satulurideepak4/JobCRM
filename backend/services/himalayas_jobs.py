"""
Himalayas job board — dedicated fetcher.

Public API, no key needed.
Runs 8 targeted queries in parallel and deduplicates by URL.
Filters to jobs posted within the last 10 days.
"""

import asyncio
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Dict, List

import httpx

HEADERS = {"User-Agent": "Mozilla/5.0 JobCRM/1.0 (personal job tracker)"}
BASE_URL = "https://himalayas.app/api/jobs"
MAX_DAYS = 10

HIMALAYAS_QUERIES = [
    "backend engineer java",
    "backend engineer golang",
    "kafka engineer",
    "api platform engineer",
    "platform engineer backend",
    "senior backend engineer remote",
    "fintech backend engineer",
    "data pipeline engineer",
]


def _within_days(date_str: str, days: int = MAX_DAYS) -> bool:
    if not date_str:
        return True
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        # Try ISO format
        clean = date_str.replace("Z", "+00:00")
        dt    = datetime.fromisoformat(clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt >= cutoff
    except Exception:
        return True


def _dedup(company: str, title: str) -> str:
    raw = f"{company.lower().strip()}{title.lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()


async def _fetch_query(client: httpx.AsyncClient, query: str) -> List[Dict]:
    """Fetch one page of Himalayas results for a query."""
    try:
        resp = await client.get(
            BASE_URL,
            params={"q": query, "limit": 100, "remote": "true"},
            timeout=15,
        )
        if resp.status_code != 200:
            print(f"Himalayas query '{query}' returned HTTP {resp.status_code}")
            return []
        data = resp.json()
        return data.get("jobs", [])
    except Exception as e:
        print(f"Himalayas query '{query}' error: {e}")
        return []


async def fetch_himalayas_targeted(profile: Dict) -> List[Dict]:
    """
    Run all HIMALAYAS_QUERIES in parallel, deduplicate by URL,
    filter to last 10 days, return standardized job dicts.
    """
    results   = []
    seen_urls = set()
    seen_keys = set()

    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True) as client:
        all_pages = await asyncio.gather(
            *[_fetch_query(client, q) for q in HIMALAYAS_QUERIES],
            return_exceptions=True,
        )

    for page_jobs in all_pages:
        if isinstance(page_jobs, Exception):
            print(f"Himalayas page error: {page_jobs}")
            continue

        for job in page_jobs:
            title   = (job.get("title") or "").strip()
            company = (job.get("companyName") or "").strip()
            url     = job.get("applicationLink") or job.get("url") or ""

            if not title or not url:
                continue
            if url in seen_urls:
                continue

            # Date filter
            published = job.get("publishedAt") or job.get("createdAt") or ""
            if not _within_days(published, MAX_DAYS):
                continue

            key = _dedup(company, title)
            if key in seen_keys:
                continue

            seen_urls.add(url)
            seen_keys.add(key)

            # Salary
            salary   = ""
            sal_min  = job.get("minSalary")
            sal_max  = job.get("maxSalary")
            currency = job.get("currency", "USD")
            if sal_min and sal_max:
                salary = f"{currency} {int(sal_min):,} – {int(sal_max):,}"
            elif sal_min:
                salary = f"{currency} {int(sal_min):,}+"

            tags     = [c for c in (job.get("categories") or []) if c]
            location_parts = job.get("locationRestrictions") or []
            location = ", ".join(location_parts) if location_parts else "Remote"

            import html as html_mod, re
            desc_raw = job.get("description") or job.get("excerpt") or ""
            desc_raw = html_mod.unescape(desc_raw)
            desc_raw = re.sub(r"<[^>]+>", " ", desc_raw)
            desc     = re.sub(r"\s+", " ", desc_raw).strip()[:2000]

            results.append({
                "title":           title,
                "company_name":    company,
                "company_website": f"https://himalayas.app/companies/{job.get('companySlug', '')}",
                "description":     desc,
                "location":        location,
                "salary_range":    salary,
                "job_type":        (job.get("employmentType") or "full-time").lower(),
                "source":          "himalayas",
                "source_url":      url,
                "tags":            tags,
                "dedup_key":       key,
            })

    print(f"Himalayas targeted: {len(results)} relevant jobs")
    return results
