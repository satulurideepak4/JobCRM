"""
HN "Who is Hiring" fetcher — Algolia-based thread discovery.

Finds the current month's thread via HN Algolia search, then fetches all
top-level comments from the Firebase API, filtering for remote backend roles.
"""

import asyncio
import html
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional

import httpx

HN_BASE    = "https://hacker-news.firebaseio.com/v0"
ALGOLIA_URL = "https://hn.algolia.com/api/v1/search"
HEADERS    = {"User-Agent": "Mozilla/5.0 JobCRM/1.0 (personal job tracker)"}

# Keywords that must be present (at least one) for a comment to be kept
_KEEP_KEYWORDS = [
    "java", "golang", "go", "kafka", "spring", "backend", "api", "python",
    "distributed", "streaming", "platform", "infra", "fintech", "payments",
]

# Keywords that immediately discard a comment
_REJECT_KEYWORDS = [
    "staffing", "consulting", "outsourc", "no remote", "onsite only",
    "on-site only", "in office only",
]


def _strip_html(text: str) -> str:
    text = html.unescape(text or "")
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


def _extract_apply_url(text: str, comment_id: int) -> str:
    urls = re.findall(r"https?://\S+", text)
    for url in urls:
        url = url.rstrip(".,);>\"'")
        if "news.ycombinator.com" not in url:
            return url
    return f"https://news.ycombinator.com/item?id={comment_id}"


def _parse_comment(comment_id: int, raw_text: str, ts: int) -> Optional[Dict]:
    """
    Parse an HN Who's Hiring comment into a job dict.
    Returns None if the comment doesn't look like a job posting.
    """
    text = _strip_html(raw_text)
    if not text or len(text) < 40:
        return None

    text_lower = text.lower()

    # Must contain "remote"
    if "remote" not in text_lower:
        return None

    # Must contain at least one relevant keyword
    if not any(kw in text_lower for kw in _KEEP_KEYWORDS):
        return None

    # Must not contain reject keywords
    if any(kw in text_lower for kw in _REJECT_KEYWORDS):
        return None

    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if not lines:
        return None

    company = ""
    title   = ""

    # Pattern: "Company | Role | Location | ..."
    first_line = lines[0]
    if "|" in first_line:
        parts = [p.strip() for p in first_line.split("|")]
        if len(parts) >= 2:
            company = parts[0].rstrip("(").strip()
            title   = parts[1].strip()

    # Pattern: "Company – Role" or "Company — Role"
    if not company:
        dash_m = re.match(r'^(.{3,50}?)\s*[–—-]{1,2}\s*(.+)', first_line)
        if dash_m:
            company = dash_m.group(1).strip()
            title   = dash_m.group(2).strip()

    # Pattern: "Company is hiring [a/an] Role"
    if not company:
        hire_m = re.match(
            r'^(.{3,50}?)\s+(?:is\s+)?hiring\s+(?:a\s+|an\s+)?(.{5,80})',
            first_line, re.IGNORECASE
        )
        if hire_m:
            company = hire_m.group(1).strip()
            title   = hire_m.group(2).strip()

    # Remove YC batch tags like "(YC S23)"
    company = re.sub(r'\s*\(YC\s*[A-Z]\d+\)', '', company).strip()
    title   = re.sub(r'\s*\(YC\s*[A-Z]\d+\)', '', title).strip()

    if not company or not title:
        # Use entire first line as title, mark company as Unknown
        title   = first_line[:100]
        company = "Unknown (HN)"

    # Extract location hint from first line
    location = "Remote"
    loc_m = re.search(
        r'\b(remote|worldwide|us only|united states|new york|san francisco|'
        r'seattle|austin|chicago|boston|los angeles)\b',
        first_line + " " + (lines[1] if len(lines) > 1 else ""),
        re.IGNORECASE
    )
    if loc_m:
        location = loc_m.group(1).capitalize()

    salary      = _extract_salary(text)
    apply_url   = _extract_apply_url(text, comment_id)
    description = " ".join(lines[1:])[:2000] if len(lines) > 1 else text[:2000]

    posted_dt = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None

    return {
        "title":           title[:120],
        "company_name":    company[:100],
        "company_website": "",
        "description":     description,
        "location":        location,
        "salary_range":    salary,
        "job_type":        "full-time",
        "source":          "hn_hiring",
        "source_url":      apply_url,
        "tags":            ["HN Hiring"],
        "remote":          True,
        "posted_at":       posted_dt,
    }


async def _get_current_thread_id(client: httpx.AsyncClient) -> Optional[int]:
    """Use HN Algolia to find the current 'Who is Hiring' thread ID."""
    try:
        resp = await client.get(
            ALGOLIA_URL,
            params={
                "query":        "Ask HN: Who is Hiring",
                "tags":         "story,author_whoishiring",
                "hitsPerPage":  "1",
            },
            timeout=10,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        hits = data.get("hits", [])
        if hits:
            return int(hits[0]["objectID"])
    except Exception as e:
        print(f"HN Algolia thread lookup error: {e}")
    return None


async def _fetch_comments(client: httpx.AsyncClient, thread_id: int) -> List[Dict]:
    """Fetch all top-level comment dicts for the given thread."""
    try:
        resp = await client.get(
            f"{HN_BASE}/item/{thread_id}.json", timeout=12
        )
        if resp.status_code != 200:
            return []
        thread = resp.json()
        kid_ids = thread.get("kids", [])
        if not kid_ids:
            return []

        comments  = []
        chunk_sz  = 40
        limits    = httpx.Limits(max_connections=40, max_keepalive_connections=20)

        for i in range(0, len(kid_ids), chunk_sz):
            chunk = kid_ids[i:i + chunk_sz]
            tasks = [
                client.get(f"{HN_BASE}/item/{kid}.json", timeout=8)
                for kid in chunk
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, Exception):
                    continue
                if r.status_code != 200:
                    continue
                d = r.json()
                if d and not d.get("dead") and not d.get("deleted"):
                    comments.append(d)
            await asyncio.sleep(0.05)

        return comments
    except Exception as e:
        print(f"HN comment fetch error: {e}")
        return []


async def fetch_hn_hiring_algolia(profile: Dict) -> List[Dict]:
    """
    Main entry point.
    Finds current HN Who's Hiring thread via Algolia, parses comments into jobs.
    """
    results   = []
    seen_urls = set()

    async with httpx.AsyncClient(headers=HEADERS, timeout=20, follow_redirects=True) as client:
        thread_id = await _get_current_thread_id(client)
        if not thread_id:
            print("HN Algolia Hiring: could not find current thread")
            return []

        print(f"HN Algolia Hiring: found thread {thread_id}")
        comments = await _fetch_comments(client, thread_id)
        print(f"HN Algolia Hiring: {len(comments)} top-level comments")

        for comment in comments:
            raw_text = comment.get("text", "")
            if not raw_text:
                continue
            ts  = comment.get("time", 0)
            job = _parse_comment(comment["id"], raw_text, ts)
            if not job:
                continue

            url = job["source_url"]
            if url in seen_urls:
                continue
            seen_urls.add(url)
            results.append(job)

    print(f"HN Algolia Hiring: {len(results)} relevant jobs after filtering")
    return results
