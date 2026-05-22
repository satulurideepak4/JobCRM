"""
HN Who's Hiring scraper.
Every month YC posts "Ask HN: Who is hiring?" — fetches the latest 2 months,
parses each comment into a structured job, and filters by profile keywords + location.
Free public API, no auth, no rate limits worth worrying about.
"""
import asyncio
import hashlib
import html
import re
from typing import List, Dict, Optional

import httpx

HN_BASE = "https://hacker-news.firebaseio.com/v0"
HN_ALGOLIA = "https://hn.algolia.com/api/v1/search_by_date"

# Reuse same location sets as other scrapers
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
    if any(b in loc for b in BLOCKED_LOCATIONS):
        return False
    if any(a in loc for a in ALLOWED_LOCATIONS):
        return True
    if "remote" in loc:
        return True
    return True  # unknown → allow, local_filter will further judge


def _dedup_key(company: str, title: str) -> str:
    raw = f"{company.lower().strip()}{title.lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _strip_html(text: str) -> str:
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _extract_salary(text: str) -> str:
    """Pull salary range like $120k-$160k or $120,000 - $160,000."""
    patterns = [
        r"\$[\d,]+k?\s*[-–to]+\s*\$[\d,]+k?",   # $120k-$160k
        r"\$[\d,]+\s*[-–to]+\s*\$[\d,]+",          # $120,000-$160,000
        r"\$[\d,]+k",                               # $120k standalone
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group().strip()
    return ""


def _extract_apply_url(text: str) -> str:
    """Get the first https:// URL in the comment (usually the apply link)."""
    m = re.search(r"https?://\S+", text)
    if m:
        url = m.group().rstrip(".,);>\"'")
        return url
    return ""


def _parse_comment(comment_id: int, raw_text: str) -> Optional[Dict]:
    """
    Parse a single HN comment into a structured job dict.
    Typical format (first line):
        Company | Role | Location | Type | $salary
    or:
        Company | Role | Location | REMOTE | Full-time | $salary
    Returns None if the comment doesn't look like a job post.
    """
    text = _strip_html(raw_text)
    if not text or len(text) < 40:
        return None

    lines = [l.strip() for l in text.split("\n") if l.strip()]
    first_line = lines[0]

    # Must have at least 2 pipe-separated parts to be a job post
    parts = [p.strip() for p in first_line.split("|")]
    if len(parts) < 2:
        return None

    company = parts[0].strip()
    if not company or len(company) > 80:
        return None

    title = parts[1].strip() if len(parts) > 1 else ""
    if not title:
        return None

    # Location: look through remaining parts for location keywords
    location = ""
    for part in parts[2:]:
        p = part.lower()
        if any(kw in p for kw in ["remote", "onsite", "hybrid", "us", "ny", "sf", "ca", "canada",
                                    "new york", "san francisco", "austin", "seattle", "chicago",
                                    "toronto", "anywhere", "worldwide"]):
            location = part.strip()
            break
    if not location and len(parts) > 2:
        location = parts[2].strip()

    salary = _extract_salary(text)
    apply_url = _extract_apply_url(text)

    # Use the HN comment URL as fallback apply link
    if not apply_url:
        apply_url = f"https://news.ycombinator.com/item?id={comment_id}"

    # Description: everything after the first line
    description = " ".join(lines[1:])[:3000]

    return {
        "title": title,
        "company_name": company,
        "company_website": "",
        "description": description,
        "location": location or "Remote",
        "salary_range": salary,
        "job_type": "full-time",
        "source": "hn_hiring",
        "source_url": apply_url,
        "tags": [],
        "dedup_key": _dedup_key(company, title),
        "_raw_first_line": first_line,  # used for keyword matching, stripped before saving
    }


def _is_relevant(job: Dict, role_keywords: List[str], skill_keywords: List[str]) -> bool:
    """
    Relevance check against the user's profile.
    Checks title + first_line + description.
    Passes if: role keyword appears anywhere in the first line,
               OR at least 1 skill appears in the post.
    """
    title_lower = job["title"].lower()
    first_line_lower = job.get("_raw_first_line", "").lower()
    # Use 2000 chars to catch skills mentioned later in longer posts
    desc_lower = (job["description"] or "")[:2000].lower()
    combined = f"{title_lower} {first_line_lower} {desc_lower}"

    # Role keyword anywhere in the full first line (not just the title segment)
    role_in_first_line = any(kw in first_line_lower for kw in role_keywords)

    # At least 1 skill appears anywhere in the post
    skills_matched = sum(1 for s in skill_keywords if s in combined)

    return role_in_first_line or skills_matched >= 1


async def _get_hiring_thread_ids(client: httpx.AsyncClient, months: int = 2) -> List[int]:
    """Get the last N months of 'Who is hiring' thread IDs via HN Firebase API."""
    try:
        # whoishiring user posts these threads — get their submitted list
        resp = await client.get(f"{HN_BASE}/user/whoishiring/submitted.json", timeout=10)
        if resp.status_code != 200:
            return []
        all_ids = resp.json()
        # First item is the latest thread, alternate items are "who wants to be hired"
        # Filter: only hiring threads (who is hiring, not who wants to be hired)
        # Strategy: fetch metadata for first 6 IDs and pick the hiring ones
        thread_ids = []
        check_ids = all_ids[:10]
        tasks = [client.get(f"{HN_BASE}/item/{tid}.json", timeout=8) for tid in check_ids]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        for resp in responses:
            if isinstance(resp, Exception):
                continue
            if resp.status_code != 200:
                continue
            data = resp.json()
            title = (data.get("title") or "").lower()
            if "who is hiring" in title and "wants to be hired" not in title:
                thread_ids.append(data["id"])
            if len(thread_ids) >= months:
                break
        return thread_ids
    except Exception as e:
        print(f"HN thread ID fetch error: {e}")
        return []


async def _fetch_thread_comments(client: httpx.AsyncClient, thread_id: int) -> List[Dict]:
    """Fetch all top-level comment IDs for a thread, then fetch each comment."""
    try:
        resp = await client.get(f"{HN_BASE}/item/{thread_id}.json", timeout=10)
        if resp.status_code != 200:
            return []
        thread = resp.json()
        kid_ids = thread.get("kids", [])
        if not kid_ids:
            return []

        # Fetch comments in chunks of 50 to stay polite
        comments = []
        chunk_size = 50
        for i in range(0, len(kid_ids), chunk_size):
            chunk = kid_ids[i:i + chunk_size]
            tasks = [client.get(f"{HN_BASE}/item/{kid}.json", timeout=8) for kid in chunk]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for result in results:
                if isinstance(result, Exception):
                    continue
                if result.status_code != 200:
                    continue
                data = result.json()
                if data and not data.get("dead") and not data.get("deleted"):
                    comments.append(data)
            # Small pause between chunks to be a good citizen
            await asyncio.sleep(0.1)

        return comments
    except Exception as e:
        print(f"HN thread {thread_id} fetch error: {e}")
        return []


async def fetch_hn_hiring(profile: Dict) -> List[Dict]:
    """
    Main entry point. Fetches last 2 months of HN Who's Hiring,
    parses and filters by profile keywords + location.
    """
    role = (profile.get("role") or "").lower().strip()
    skills = [s.lower().strip() for s in (profile.get("skills") or [])]

    # Build keyword sets for matching
    # Role keywords: meaningful words only (skip stop words)
    stop_words = {"and", "or", "the", "for", "with", "from", "senior", "junior", "lead", "staff"}
    role_keywords = [w for w in role.split() if len(w) > 2 and w not in stop_words]
    if not role_keywords and role:
        role_keywords = [role]

    skill_keywords = skills[:15]  # top 15 skills for matching

    if not role_keywords and not skill_keywords:
        print("HN Hiring: no profile keywords, skipping")
        return []

    results = []
    seen_keys = set()

    limits = httpx.Limits(max_connections=30, max_keepalive_connections=20)
    async with httpx.AsyncClient(limits=limits, timeout=30) as client:
        # Step 1: get thread IDs
        thread_ids = await _get_hiring_thread_ids(client, months=2)
        if not thread_ids:
            print("HN Hiring: could not find thread IDs")
            return []

        print(f"HN Hiring: found {len(thread_ids)} threads: {thread_ids}")

        # Step 2: fetch all comments from each thread
        for thread_id in thread_ids:
            comments = await _fetch_thread_comments(client, thread_id)
            print(f"HN Hiring: thread {thread_id} has {len(comments)} comments")

            for comment in comments:
                raw_text = comment.get("text", "")
                if not raw_text:
                    continue

                job = _parse_comment(comment["id"], raw_text)
                if not job:
                    continue

                # Location filter
                if not _is_allowed_location(job["location"]):
                    continue

                # Profile relevance filter (strict)
                if not _is_relevant(job, role_keywords, skill_keywords):
                    continue

                # Dedup
                key = job["dedup_key"]
                if key in seen_keys:
                    continue
                seen_keys.add(key)

                # Clean up internal-only field before returning
                job.pop("_raw_first_line", None)
                results.append(job)

    print(f"HN Hiring: {len(results)} relevant jobs after filtering")
    return results
