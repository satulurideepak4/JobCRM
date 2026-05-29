"""
YC / Hacker News Jobs fetcher.

Uses the HN Firebase API endpoint:
  https://hacker-news.firebaseio.com/v0/jobstories.json

This returns up to ~200 most recent job postings on news.ycombinator.com/jobs —
a dedicated feed of job posts from YC-backed companies, separate from the monthly
"Who's Hiring" thread. Every post is from an actual YC portfolio company.
"""

import asyncio
import hashlib
import html
import re
from typing import Dict, List, Optional

import httpx

from services.date_utils import is_within_days, is_location_ok, extract_skill_keywords

HN_BASE = "https://hacker-news.firebaseio.com/v0"
HEADERS = {"User-Agent": "Mozilla/5.0 JobCRM/1.0 (personal job tracker)"}

ALLOWED_LOCATIONS = {
    "remote", "worldwide", "anywhere", "global", "us", "usa", "united states",
    "canada", "north america", "us/canada",
    "est", "cst", "mst", "pst",
    "new york", "san francisco", "seattle", "austin", "chicago", "boston",
    "los angeles", "denver", "atlanta", "toronto", "vancouver",
}
BLOCKED_LOCATIONS = {
    "uk", "united kingdom", "europe", "eu", "germany", "france", "india",
    "australia", "new zealand", "singapore", "china", "japan", "brazil",
}


def _is_allowed(location: str) -> bool:
    if not location:
        return True
    loc = location.lower()
    if any(b in loc for b in BLOCKED_LOCATIONS):
        return False
    if "remote" in loc:
        return True
    if any(a in loc for a in ALLOWED_LOCATIONS):
        return True
    return True


def _dedup(company: str, title: str) -> str:
    return hashlib.sha256(f"{company.lower().strip()}{title.lower().strip()}".encode()).hexdigest()


def _strip_html(text: str) -> str:
    text = html.unescape(text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _parse_yc_job(story: dict) -> Optional[dict]:
    """
    Parse a single HN job story into a structured job dict.
    HN job story title patterns:
      "Acme (YC S23) – Hiring Backend Engineers | Remote | $150-200k"
      "Acme Inc | Senior Data Engineer | Remote"
      "Acme is hiring a Backend Engineer"
    """
    title_raw = (story.get("title") or "").strip()
    text_raw = story.get("text") or ""
    url = (story.get("url") or "").strip()
    time_ts = story.get("time", 0)

    if not title_raw:
        return None

    text = _strip_html(text_raw)

    # ── Extract company name ───────────────────────────────────────────────────
    company = ""
    job_title = title_raw

    # Pattern: "Company (YC S23) ..." or "Company (YCS23) ..."
    yc_match = re.match(r'^(.+?)\s*\(YC\s*[A-Z]\d+\)', title_raw, re.IGNORECASE)
    if yc_match:
        company = yc_match.group(1).strip().rstrip("–-—").strip()

    # Pattern: "Company | Role | ..."
    if not company and " | " in title_raw:
        parts = title_raw.split(" | ")
        company = parts[0].strip()
        job_title = parts[1].strip() if len(parts) > 1 else title_raw

    # Pattern: "Company – Role" or "Company — Role"
    if not company:
        dash_match = re.match(r'^(.{3,40}?)\s*[–—-]{1,2}\s*(.+)', title_raw)
        if dash_match:
            company = dash_match.group(1).strip()
            job_title = dash_match.group(2).strip()

    # Pattern: "Company is hiring [a/an] Role"
    if not company:
        hiring_match = re.match(
            r'^(.{3,50}?)\s+(?:is\s+)?hiring\s+(?:a\s+|an\s+)?(.{5,80})',
            title_raw, re.IGNORECASE
        )
        if hiring_match:
            company = hiring_match.group(1).strip()
            job_title = hiring_match.group(2).strip()

    if not company:
        company = "YC Company"
    if not job_title or job_title == title_raw:
        # Use the full title as job title if we couldn't extract a separate role
        job_title = title_raw

    # Clean trailing punctuation
    job_title = re.sub(r'\s*\(YC\s*[A-Z]\d+\)', '', job_title, flags=re.IGNORECASE).strip()
    job_title = job_title[:120]

    # ── Location ──────────────────────────────────────────────────────────────
    location = "Remote"
    loc_match = re.search(
        r'\b(remote|worldwide|us only|united states|new york|san francisco|'
        r'seattle|austin|chicago|boston|los angeles|toronto)\b',
        title_raw + " " + text[:500], re.IGNORECASE
    )
    if loc_match:
        location = loc_match.group(1).capitalize()

    # ── Salary ────────────────────────────────────────────────────────────────
    salary = ""
    sal_match = re.search(
        r'\$[\d,]+k?\s*[-–]+\s*\$?[\d,]+k?|\$[\d,]+k\+?',
        title_raw + " " + text[:500], re.IGNORECASE
    )
    if sal_match:
        salary = sal_match.group().strip()

    # ── Apply URL ─────────────────────────────────────────────────────────────
    apply_url = url
    if not apply_url:
        urls_in_text = re.findall(r'https?://\S+', text)
        for u in urls_in_text:
            u = u.rstrip(".,);>\"'")
            if "ycombinator.com" not in u and "news.yc" not in u:
                apply_url = u
                break
    if not apply_url:
        apply_url = f"https://news.ycombinator.com/item?id={story['id']}"

    description = text[:2000] if text else f"YC company hiring: {title_raw}"

    return {
        "title": job_title,
        "company_name": company,
        "company_website": "",
        "description": description,
        "location": location,
        "salary_range": salary,
        "job_type": "full-time",
        "source": "yc_jobs",
        "source_url": apply_url,
        "tags": ["YC"],
        "dedup_key": _dedup(company, job_title),
    }


def _is_relevant(job: dict, role_kw: List[str], skill_kw: List[str]) -> bool:
    title_l = job["title"].lower()
    combined = f"{title_l} {job['description'][:600].lower()}"
    if any(kw in title_l for kw in role_kw):
        return True
    return sum(1 for s in skill_kw if s in combined) >= 2


async def fetch_yc_jobs(profile: Dict) -> List[Dict]:
    """
    Fetch recent YC company job postings from the HN jobs feed.
    Filtered to last 20 days, relevant to the user's profile.
    """
    role = (profile.get("role") or "").lower()
    stop = {"and", "or", "the", "for", "with", "senior", "junior", "lead", "staff"}
    role_kw = [w for w in role.split() if len(w) > 2 and w not in stop] or [role]
    skill_kw = extract_skill_keywords(profile.get("skills") or [])

    results = []
    seen_keys: set = set()

    limits = httpx.Limits(max_connections=30, max_keepalive_connections=20)
    async with httpx.AsyncClient(headers=HEADERS, limits=limits, timeout=20) as client:
        # Step 1: Get list of recent job story IDs
        try:
            resp = await client.get(f"{HN_BASE}/jobstories.json")
            if resp.status_code != 200:
                print("YC Jobs: failed to fetch story IDs")
                return []
            story_ids = resp.json()[:200]  # up to 200 most recent
        except Exception as e:
            print(f"YC Jobs: error fetching story IDs: {e}")
            return []

        # Step 2: Fetch story details in chunks (respect HN rate limits)
        chunk_size = 40
        for i in range(0, len(story_ids), chunk_size):
            chunk = story_ids[i:i + chunk_size]
            tasks = [
                client.get(f"{HN_BASE}/item/{sid}.json", timeout=8)
                for sid in chunk
            ]
            responses = await asyncio.gather(*tasks, return_exceptions=True)

            for resp in responses:
                if isinstance(resp, Exception):
                    continue
                if resp.status_code != 200:
                    continue
                story = resp.json()
                if not story or story.get("deleted") or story.get("dead"):
                    continue
                if story.get("type") != "job":
                    continue
                # Date filter: only last 20 days
                if not is_within_days(story.get("time")):
                    continue

                job = _parse_yc_job(story)
                if not job:
                    continue
                if not is_location_ok(job["location"], profile):
                    continue
                if not _is_relevant(job, role_kw, skill_kw):
                    continue

                key = job["dedup_key"]
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                results.append(job)

            await asyncio.sleep(0.05)  # gentle pacing

    print(f"YC Jobs: {len(results)} relevant jobs")
    return results
