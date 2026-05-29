"""
HN Who's Hiring scraper.
Every month YC posts "Ask HN: Who is hiring?" — fetches the latest 2 months,
parses each comment into a structured job, and filters by profile keywords + location.
Free public API, no auth, no meaningful rate limits.

Fixes applied:
- skill_matched threshold raised 1 → 2 (was too permissive)
- Added fallback parser for free-form (non-pipe) posts
- Better location extraction
"""
import asyncio
import hashlib
import html
import re
from typing import List, Dict, Optional

import httpx
from services.date_utils import is_location_ok, extract_skill_keywords

HN_BASE = "https://hacker-news.firebaseio.com/v0"

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
    return True


def _dedup_key(company: str, title: str) -> str:
    raw = f"{company.lower().strip()}{title.lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _strip_html(text: str) -> str:
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _extract_salary(text: str) -> str:
    patterns = [
        r"\$[\d,]+k?\s*[-–to]+\s*\$[\d,]+k?",
        r"\$[\d,]+\s*[-–to]+\s*\$[\d,]+",
        r"\$[\d,]+k",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group().strip()
    return ""


def _extract_apply_url(text: str) -> str:
    # Skip HN links themselves as apply URL, prefer external URLs
    urls = re.findall(r"https?://\S+", text)
    for url in urls:
        url = url.rstrip(".,);>\"'")
        if "news.ycombinator.com" not in url:
            return url
    # Fallback to any URL
    if urls:
        return urls[0].rstrip(".,);>\"'")
    return ""


def _parse_comment_pipe(comment_id: int, text: str, lines: List[str]) -> Optional[Dict]:
    """Parse structured pipe-format HN posts: Company | Role | Location | ..."""
    first_line = lines[0]
    parts = [p.strip() for p in first_line.split("|")]

    if len(parts) < 2:
        return None

    company = parts[0].strip()
    if not company or len(company) > 100:
        return None

    title = parts[1].strip()
    if not title or len(title) < 3:
        return None

    # Extract location from remaining pipe parts
    location = ""
    for part in parts[2:]:
        p = part.lower()
        if any(kw in p for kw in ["remote", "onsite", "on-site", "hybrid", "anywhere",
                                    "worldwide", "us", "usa", "ny", "sf", "ca", "canada",
                                    "new york", "san francisco", "austin", "seattle",
                                    "chicago", "toronto", "boston"]):
            location = part.strip()
            break
    if not location and len(parts) > 2:
        location = parts[2].strip()

    return company, title, location


def _parse_comment_freeform(comment_id: int, text: str, lines: List[str]) -> Optional[Dict]:
    """
    Fallback parser for free-form HN posts like:
    'Acme Inc (acme.com) | Hiring backend engineers | Remote'
    or
    'We are Acme, a Series A fintech startup. Looking for senior backend engineers...'
    """
    first_line = lines[0]

    # Pattern 1: "CompanyName is hiring [role]" or "CompanyName | hiring..."
    hiring_match = re.search(
        r'^(.{2,60}?)\s*(?:is\s+)?(?:hiring|looking for|seeking)\s+(?:a\s+|an\s+)?(.{5,80})',
        first_line, re.IGNORECASE
    )
    if hiring_match:
        company = hiring_match.group(1).strip().rstrip('(|-').strip()
        title = hiring_match.group(2).strip().rstrip('.,!').strip()
        if company and title and len(company) < 80:
            return company, title[:80], ""

    # Pattern 2: "CompanyName (url) | Role"
    parens_match = re.match(r'^(.{2,60}?)\s*\([^)]+\)\s*[|-]\s*(.{5,80})', first_line)
    if parens_match:
        company = parens_match.group(1).strip()
        title = parens_match.group(2).strip()
        if company and title:
            return company, title[:80], ""

    # Pattern 3: first word(s) before comma or colon are the company
    # "Acme, Series A startup, hiring senior backend engineers"
    comma_match = re.match(r'^([A-Z][^,.\n]{2,40}),\s*(?:Series [A-Z]|Seed|YC|YCombinator|startup)', first_line)
    if comma_match:
        company = comma_match.group(1).strip()
        # Find role in rest of text
        role_match = re.search(
            r'(?:hiring|looking for|need|seeking)\s+(?:a\s+|an\s+)?([^.!\n]{5,60})',
            text, re.IGNORECASE
        )
        if role_match:
            title = role_match.group(1).strip()
            return company, title[:80], ""

    return None


def _parse_comment(comment_id: int, raw_text: str) -> Optional[Dict]:
    """
    Parse a single HN Who's Hiring comment into a structured job dict.
    Returns None if the comment doesn't look like a job post.
    """
    text = _strip_html(raw_text)
    if not text or len(text) < 40:
        return None

    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if not lines:
        return None

    company = title = location = ""

    # Try pipe format first (most common in HN hiring threads)
    pipe_result = _parse_comment_pipe(comment_id, text, lines)
    if pipe_result:
        company, title, location = pipe_result
    else:
        # Try free-form parsing
        freeform_result = _parse_comment_freeform(comment_id, text, lines)
        if freeform_result:
            company, title, location = freeform_result
        else:
            return None  # Can't reliably identify company or title

    if not company or not title:
        return None

    # Try to find remote indication in the full text
    if not location:
        if re.search(r'\b(remote|work from home|wfh|distributed team)\b', text, re.IGNORECASE):
            location = "Remote"
        elif re.search(r'\b(us only|united states|north america)\b', text, re.IGNORECASE):
            location = "US"

    salary = _extract_salary(text)
    apply_url = _extract_apply_url(text)

    if not apply_url:
        apply_url = f"https://news.ycombinator.com/item?id={comment_id}"

    description = " ".join(lines[1:])[:3000] if len(lines) > 1 else text[:3000]

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
        "_raw_first_line": lines[0],
    }


def _is_relevant(job: Dict, role_keywords: List[str], skill_keywords: List[str]) -> bool:
    """
    Relevance check against user profile.
    Requires: role keyword in first line OR at least 2 skill matches in full post.
    (Raised from 1 to 2 — was too permissive with a single common skill like "python")
    """
    title_lower = job["title"].lower()
    first_line_lower = job.get("_raw_first_line", "").lower()
    desc_lower = (job["description"] or "")[:2000].lower()
    combined = f"{title_lower} {first_line_lower} {desc_lower}"

    role_in_first_line = any(kw in first_line_lower for kw in role_keywords)

    # Require 2+ skill matches to reduce false positives from common words
    skills_matched = sum(1 for s in skill_keywords if s in combined)

    return role_in_first_line or skills_matched >= 2


async def _get_hiring_thread_ids(client: httpx.AsyncClient, months: int = 2) -> List[int]:
    """Get the last N months of 'Who is hiring' thread IDs via HN Firebase API."""
    try:
        resp = await client.get(f"{HN_BASE}/user/whoishiring/submitted.json", timeout=10)
        if resp.status_code != 200:
            return []
        all_ids = resp.json()

        thread_ids = []
        check_ids = all_ids[:12]  # Check first 12 to find N hiring threads
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
    """Fetch all top-level comments for a thread."""
    try:
        resp = await client.get(f"{HN_BASE}/item/{thread_id}.json", timeout=10)
        if resp.status_code != 200:
            return []
        thread = resp.json()
        kid_ids = thread.get("kids", [])
        if not kid_ids:
            return []

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
    stop_words = {"and", "or", "the", "for", "with", "from", "senior", "junior",
                  "lead", "staff", "principal", "associate"}
    role_keywords = [w for w in role.split() if len(w) > 2 and w not in stop_words]
    if not role_keywords and role:
        role_keywords = [role]

    skill_keywords = extract_skill_keywords(profile.get("skills") or [])

    if not role_keywords and not skill_keywords:
        print("HN Hiring: no profile keywords, skipping")
        return []

    results = []
    seen_keys = set()

    limits = httpx.Limits(max_connections=30, max_keepalive_connections=20)
    async with httpx.AsyncClient(limits=limits, timeout=30) as client:
        thread_ids = await _get_hiring_thread_ids(client, months=2)
        if not thread_ids:
            print("HN Hiring: could not find thread IDs")
            return []

        print(f"HN Hiring: found {len(thread_ids)} threads: {thread_ids}")

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

                if not is_location_ok(job["location"], profile):
                    continue

                if not _is_relevant(job, role_keywords, skill_keywords):
                    continue

                key = job["dedup_key"]
                if key in seen_keys:
                    continue
                seen_keys.add(key)

                job.pop("_raw_first_line", None)
                results.append(job)

    print(f"HN Hiring: {len(results)} relevant jobs after filtering")
    return results
