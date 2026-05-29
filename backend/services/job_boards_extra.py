"""
Extra job board sources:
  - We Work Remotely  (RSS feeds, 8 tech categories)
  - The Muse          (public JSON API, no auth)
  - Himalayas         (public JSON API, 107k+ remote jobs)

All free, no API keys, no scraping needed.
"""

import asyncio
import hashlib
import html
import re
import xml.etree.ElementTree as ET
from typing import Dict, List

import httpx
from services.date_utils import is_within_days, is_location_ok, extract_skill_keywords

HEADERS = {"User-Agent": "Mozilla/5.0 JobCRM/1.0 (personal job tracker)"}

ALLOWED_LOCATIONS = {
    "remote", "worldwide", "anywhere", "global", "us", "usa", "united states",
    "canada", "north america", "flexible", "work from home", "distributed",
    "est", "cst", "mst", "pst", "eastern", "central", "mountain", "pacific",
    "new york", "san francisco", "seattle", "austin", "chicago",
    "los angeles", "boston", "denver", "atlanta", "toronto", "vancouver",
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


def _allowed(location: str) -> bool:
    if not location:
        return True
    loc = location.lower().strip()
    if any(b in loc for b in BLOCKED_LOCATIONS):
        return False
    if any(a in loc for a in ALLOWED_LOCATIONS):
        return True
    if "remote" in loc:
        return True
    return False  # default block unknown locations


def _dedup(company: str, title: str) -> str:
    return hashlib.sha256(f"{company.lower().strip()}{title.lower().strip()}".encode()).hexdigest()


def _strip_html(text: str) -> str:
    text = html.unescape(text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _is_relevant(title: str, desc: str, tags: List[str],
                 role_keywords: List[str], skill_keywords: List[str]) -> bool:
    title_l = title.lower()
    combined = f"{title_l} {desc.lower()[:600]} {' '.join(t.lower() for t in tags)}"
    if any(kw in title_l for kw in role_keywords):
        return True
    return sum(1 for s in skill_keywords if s in combined) >= 2


def _profile_keywords(profile: Dict):
    role = (profile.get("role") or "").lower()
    stop = {"and", "or", "the", "for", "with", "senior", "junior", "lead", "staff", "remote"}
    role_kw = [w for w in role.split() if len(w) > 2 and w not in stop] or [role]
    skill_kw = extract_skill_keywords(profile.get("skills") or [])
    return role_kw, skill_kw


# ── We Work Remotely ─────────────────────────────────────────────────────────

# Category RSS feeds — covers all major tech disciplines
_WWR_FEEDS = [
    "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
    "https://weworkremotely.com/categories/remote-data-science-jobs.rss",
    "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-security-jobs.rss",
    "https://weworkremotely.com/categories/remote-quality-assurance-jobs.rss",
]


async def _fetch_wwr_feed(client: httpx.AsyncClient, url: str) -> List[dict]:
    try:
        resp = await client.get(url, timeout=12)
        if resp.status_code != 200:
            return []
        root = ET.fromstring(resp.text)
        channel = root.find("channel")
        if channel is None:
            return []

        jobs = []
        for item in channel.findall("item"):
            if not is_within_days(item.findtext("pubDate")):
                continue
            raw_title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            region = (item.findtext("region") or "Remote").strip()
            category = (item.findtext("category") or "").strip()
            raw_desc = item.findtext("description") or ""

            # Title format: "CompanyName: Job Title"
            if ": " in raw_title:
                company, title = raw_title.split(": ", 1)
            elif " | " in raw_title:
                parts = raw_title.split(" | ", 1)
                company, title = parts[0], parts[1]
            else:
                company, title = "Unknown", raw_title

            company = company.strip()
            title = title.strip()

            if not title or not link:
                continue

            description = _strip_html(raw_desc)[:2000]
            jobs.append({
                "title": title,
                "company_name": company,
                "company_website": "",
                "description": description,
                "location": region or "Remote",
                "salary_range": "",
                "job_type": "full-time",
                "source": "weworkremotely",
                "source_url": link,
                "tags": [category] if category else [],
                "dedup_key": _dedup(company, title),
            })
        return jobs
    except Exception as e:
        print(f"WWR feed error ({url}): {e}")
        return []


async def fetch_weworkremotely(profile: Dict) -> List[Dict]:
    role_kw, skill_kw = _profile_keywords(profile)
    results, seen_keys = [], set()

    async with httpx.AsyncClient(headers=HEADERS, timeout=15, follow_redirects=True) as client:
        all_feeds = await asyncio.gather(*[_fetch_wwr_feed(client, u) for u in _WWR_FEEDS])

    for feed_jobs in all_feeds:
        for job in feed_jobs:
            if not is_location_ok(job["location"], profile):
                continue
            if not _is_relevant(job["title"], job["description"], job["tags"], role_kw, skill_kw):
                continue
            key = job["dedup_key"]
            if key in seen_keys or not job["source_url"]:
                continue
            seen_keys.add(key)
            results.append(job)

    print(f"We Work Remotely: {len(results)} relevant jobs")
    return results


# ── The Muse ─────────────────────────────────────────────────────────────────

# Categories the API supports — we pick based on role
_MUSE_CATEGORIES = {
    "engineer":      ["Software Engineer", "Data Science", "DevOps & Sysadmin"],
    "backend":       ["Software Engineer", "DevOps & Sysadmin"],
    "frontend":      ["Software Engineer", "Design & UX"],
    "fullstack":     ["Software Engineer", "DevOps & Sysadmin"],
    "data":          ["Data Science", "Software Engineer"],
    "devops":        ["DevOps & Sysadmin", "Software Engineer"],
    "ml":            ["Data Science", "Software Engineer"],
    "ai":            ["Data Science", "Software Engineer"],
    "product":       ["Product", "Software Engineer"],
    "design":        ["Design & UX"],
}

_MUSE_LEVELS = ["Senior Level", "Mid Level"]


def _pick_muse_categories(profile: Dict) -> List[str]:
    role = (profile.get("role") or "").lower()
    cats = set()
    for keyword, categories in _MUSE_CATEGORIES.items():
        if keyword in role:
            cats.update(categories)
    if not cats:
        cats.add("Software Engineer")
    return list(cats)


async def fetch_themuse(profile: Dict) -> List[Dict]:
    role_kw, skill_kw = _profile_keywords(profile)
    categories = _pick_muse_categories(profile)
    results, seen_keys = [], set()

    async with httpx.AsyncClient(headers=HEADERS, timeout=15, follow_redirects=True) as client:
        tasks = []
        for cat in categories:
            for level in _MUSE_LEVELS:
                for page in range(0, 3):  # 3 pages per category/level combo
                    tasks.append(client.get(
                        "https://www.themuse.com/api/public/jobs",
                        params={"page": page, "category": cat, "level": level},
                    ))

        responses = await asyncio.gather(*tasks, return_exceptions=True)

    for resp in responses:
        if isinstance(resp, Exception):
            continue
        try:
            data = resp.json()
        except Exception:
            continue

        for job in data.get("results", []):
            title = job.get("name", "").strip()
            company = job.get("company", {}).get("name", "").strip()
            url = job.get("refs", {}).get("landing_page", "")
            locations = job.get("locations", [])
            location = locations[0].get("name", "Remote") if locations else "Remote"
            contents = _strip_html(job.get("contents", ""))[:2000]
            cats = [c.get("name", "") for c in job.get("categories", [])]
            levels = [lv.get("name", "") for lv in job.get("levels", [])]

            if not title or not url:
                continue
            if not is_location_ok(location, profile):
                continue
            if not _is_relevant(title, contents, cats, role_kw, skill_kw):
                continue

            key = _dedup(company, title)
            if key in seen_keys:
                continue
            seen_keys.add(key)

            salary = ""
            tags = cats + levels

            results.append({
                "title": title,
                "company_name": company,
                "company_website": "",
                "description": contents,
                "location": location,
                "salary_range": salary,
                "job_type": "full-time",
                "source": "themuse",
                "source_url": url,
                "tags": tags,
                "dedup_key": key,
            })

    print(f"The Muse: {len(results)} relevant jobs")
    return results


# ── Himalayas ────────────────────────────────────────────────────────────────

_HIMALAYAS_CATEGORIES = {
    "engineer":  ["engineering", "software-development"],
    "backend":   ["engineering", "software-development"],
    "frontend":  ["engineering", "software-development", "design"],
    "fullstack": ["engineering", "software-development"],
    "data":      ["data-science", "engineering"],
    "devops":    ["devops", "engineering"],
    "ml":        ["data-science", "engineering", "machine-learning"],
    "ai":        ["data-science", "engineering", "machine-learning"],
    "product":   ["product", "engineering"],
    "security":  ["security", "engineering"],
}


def _pick_himalayas_categories(profile: Dict) -> List[str]:
    role = (profile.get("role") or "").lower()
    cats = set()
    for keyword, categories in _HIMALAYAS_CATEGORIES.items():
        if keyword in role:
            cats.update(categories)
    if not cats:
        cats.add("engineering")
    return list(cats)[:3]  # max 3 categories


async def _fetch_himalayas_page(
    client: httpx.AsyncClient, category: str, offset: int
) -> List[dict]:
    try:
        resp = await client.get(
            "https://himalayas.app/jobs/api",
            params={"limit": 100, "offset": offset, "remote": "true", "category": category},
            timeout=15,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        return data.get("jobs", [])
    except Exception as e:
        print(f"Himalayas error (cat={category}, offset={offset}): {e}")
        return []


async def fetch_himalayas(profile: Dict) -> List[Dict]:
    role_kw, skill_kw = _profile_keywords(profile)
    categories = _pick_himalayas_categories(profile)
    results, seen_keys = [], set()

    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True) as client:
        # Fetch 2 pages (0-99, 100-199) per category in parallel
        tasks = []
        for cat in categories:
            for offset in [0, 100]:
                tasks.append(_fetch_himalayas_page(client, cat, offset))

        all_pages = await asyncio.gather(*tasks, return_exceptions=True)

    for page_jobs in all_pages:
        if isinstance(page_jobs, Exception):
            continue
        for job in page_jobs:
            if not is_within_days(job.get("createdAt")):
                continue
            title = (job.get("title") or "").strip()
            company = (job.get("companyName") or "").strip()
            url = job.get("applicationLink") or job.get("guid") or ""
            description = _strip_html(job.get("description") or job.get("excerpt") or "")[:2000]
            location = ", ".join(job.get("locationRestrictions") or []) or "Remote"
            salary = ""
            sal_min = job.get("minSalary")
            sal_max = job.get("maxSalary")
            currency = job.get("currency", "USD")
            if sal_min and sal_max:
                salary = f"{currency} {int(sal_min):,} – {int(sal_max):,}"
            elif sal_min:
                salary = f"{currency} {int(sal_min):,}+"

            tags = [c for c in (job.get("categories") or []) if c]
            emp_type = job.get("employmentType") or "full-time"

            if not title or not url:
                continue
            if not is_location_ok(location, profile):
                continue
            if not _is_relevant(title, description, tags, role_kw, skill_kw):
                continue

            key = _dedup(company, title)
            if key in seen_keys:
                continue
            seen_keys.add(key)

            results.append({
                "title": title,
                "company_name": company,
                "company_website": f"https://himalayas.app/companies/{job.get('companySlug', '')}",
                "description": description,
                "location": location,
                "salary_range": salary,
                "job_type": emp_type.lower(),
                "source": "himalayas",
                "source_url": url,
                "tags": tags,
                "dedup_key": key,
            })

    print(f"Himalayas: {len(results)} relevant jobs")
    return results


# ── Working Nomads ────────────────────────────────────────────────────────────

_WN_CATEGORIES = {
    "engineer":  ["development"],
    "backend":   ["development", "devops"],
    "frontend":  ["development"],
    "fullstack":  ["development"],
    "data":      ["development", "data-science"],
    "devops":    ["devops", "sysadmin"],
    "ml":        ["development", "data-science"],
    "ai":        ["development", "data-science"],
    "security":  ["sysadmin", "devops"],
    "product":   ["product"],
    "design":    ["design"],
}


def _pick_wn_categories(profile: Dict) -> List[str]:
    role = (profile.get("role") or "").lower()
    cats: set = set()
    for kw, c in _WN_CATEGORIES.items():
        if kw in role:
            cats.update(c)
    return list(cats)[:2] if cats else ["development"]


async def fetch_workingnomads(profile: Dict) -> List[Dict]:
    """Working Nomads public JSON API — curated remote dev jobs."""
    categories = _pick_wn_categories(profile)
    role_kw, skill_kw = _profile_keywords(profile)
    results, seen_keys = [], set()

    async with httpx.AsyncClient(headers=HEADERS, timeout=20, follow_redirects=True) as client:
        tasks = [
            client.get("https://www.workingnomads.com/jobs",
                       params={"category": cat, "format": "json"})
            for cat in categories
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

    for resp in responses:
        if isinstance(resp, Exception):
            continue
        try:
            payload = resp.json()
            jobs = payload if isinstance(payload, list) else payload.get("jobs", [])
        except Exception:
            continue

        for job in jobs:
            title = (job.get("title") or "").strip()
            company = (job.get("company_name") or "").strip()
            url = (job.get("url") or "").strip()
            description = _strip_html(job.get("description") or "")[:2000]
            location = (job.get("location") or "Remote").strip()

            if not title or not url:
                continue
            if not is_location_ok(location, profile):
                continue
            if not _is_relevant(title, description, [], role_kw, skill_kw):
                continue

            key = _dedup(company, title)
            if key in seen_keys:
                continue
            seen_keys.add(key)

            results.append({
                "title": title,
                "company_name": company,
                "company_website": "",
                "description": description,
                "location": location,
                "salary_range": "",
                "job_type": "full-time",
                "source": "workingnomads",
                "source_url": url,
                "tags": [],
                "dedup_key": key,
            })

    print(f"Working Nomads: {len(results)} relevant jobs")
    return results


# ── Remote.co ─────────────────────────────────────────────────────────────────

_REMOTECO_FEEDS = [
    "https://remote.co/remote-jobs/software-dev/feed/",
    "https://remote.co/remote-jobs/devops-and-sysadmin/feed/",
    "https://remote.co/remote-jobs/data-science/feed/",
    "https://remote.co/remote-jobs/artificial-intelligence/feed/",
    "https://remote.co/remote-jobs/back-end-programming/feed/",
    "https://remote.co/remote-jobs/full-stack-programming/feed/",
]


async def _fetch_remoteco_feed(client: httpx.AsyncClient, url: str) -> List[dict]:
    try:
        resp = await client.get(url, timeout=12)
        if resp.status_code != 200:
            return []
        root = ET.fromstring(resp.text)
        channel = root.find("channel")
        if channel is None:
            return []

        jobs = []
        for item in channel.findall("item"):
            if not is_within_days(item.findtext("pubDate")):
                continue
            raw_title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            raw_desc = item.findtext("description") or ""

            # Remote.co title format: "Job Title at Company Name"
            if " at " in raw_title:
                title, company = raw_title.rsplit(" at ", 1)
            else:
                title, company = raw_title, "Unknown"

            title = title.strip()
            company = company.strip()
            description = _strip_html(raw_desc)[:2000]

            if not title or not link:
                continue

            jobs.append({
                "title": title,
                "company_name": company,
                "company_website": "",
                "description": description,
                "location": "Remote",
                "salary_range": "",
                "job_type": "full-time",
                "source": "remoteco",
                "source_url": link,
                "tags": [],
                "dedup_key": _dedup(company, title),
            })
        return jobs
    except Exception as e:
        print(f"Remote.co feed error ({url}): {e}")
        return []


async def fetch_remoteco(profile: Dict) -> List[Dict]:
    """Remote.co RSS feeds — curated remote tech jobs."""
    role_kw, skill_kw = _profile_keywords(profile)
    results, seen_keys = [], set()

    async with httpx.AsyncClient(headers=HEADERS, timeout=15, follow_redirects=True) as client:
        all_feeds = await asyncio.gather(
            *[_fetch_remoteco_feed(client, u) for u in _REMOTECO_FEEDS]
        )

    for feed_jobs in all_feeds:
        for job in feed_jobs:
            if not _is_relevant(job["title"], job["description"], [], role_kw, skill_kw):
                continue
            key = job["dedup_key"]
            if key in seen_keys or not job["source_url"]:
                continue
            seen_keys.add(key)
            results.append(job)

    print(f"Remote.co: {len(results)} relevant jobs")
    return results


# ── Aggregate ─────────────────────────────────────────────────────────────────

async def fetch_extra_jobs(profile: Dict) -> List[Dict]:
    """Fetch from all extra sources in parallel."""
    wwr, muse, himalayas, wn, remoteco = await asyncio.gather(
        fetch_weworkremotely(profile),
        fetch_themuse(profile),
        fetch_himalayas(profile),
        fetch_workingnomads(profile),
        fetch_remoteco(profile),
        return_exceptions=True,
    )

    all_jobs, seen_keys = [], set()
    for source in [wwr, muse, himalayas, wn, remoteco]:
        if isinstance(source, Exception):
            print(f"Extra source error: {source}")
            continue
        for job in source:
            key = job.get("dedup_key", _dedup(job.get("company_name", ""), job.get("title", "")))
            if key not in seen_keys and job.get("source_url"):
                seen_keys.add(key)
                all_jobs.append(job)

    return all_jobs
