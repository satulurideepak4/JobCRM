# FIXES — JobCRM overhaul

All changes made during the 10-problem overhaul. Listed by file with a one-line reason for each change.

---

## backend/services/scorer.py — complete rewrite

**What changed:**
- Replaced ad-hoc `local_filter()` point system with `SKILL_GROUPS` weighted synonym matching (threshold ≥ 4)
- Added `HARD_REJECT_TERMS` list — any job matching a term is discarded before the LLM call
- LLM batch size reduced from 20 → 10 jobs per call (better scoring accuracy)
- LLM score scale: now 1–10 from LLM, stored as ×10 (10–100) in DB; `LLM_MIN` updated to 70
- `_score_batch()` now uses `JOB_SCORING_SYSTEM_PROMPT` from `llm_service.py`

**Why:** Old keyword matching missed synonyms ("event streaming" ≠ "kafka"), had no hard rejects, and used a generic scoring prompt unaware of the actual candidate.

---

## backend/llm_service.py — added JOB_SCORING_SYSTEM_PROMPT

**What changed:**
- Added `JOB_SCORING_SYSTEM_PROMPT` constant with verbatim candidate profile (Deepak Satuluri — Java 17, Go, Kafka, Spring Boot, remote-first, Bengaluru)
- Scoring rubric embedded: 1–10 scale, hard reject rules, strong match criteria

**Why:** Generic prompts produce noisy scores. Candidate-specific prompt gives consistent 1–10 ratings aligned to actual priorities.

---

## backend/agents/job_search_agent.py — major update

**What changed:**
- Added `_is_fuzzy_duplicate()` using `difflib.SequenceMatcher` ratio > 0.85 on `company+title` — prevents same job from multiple boards hitting DB
- Two new sources added: `hn_hiring` (Algolia) and `himalayas`
- Summary stats printed after each run: fetched → after_dedup → after_keyword → after_embedding → after_llm → strong_matches
- Warns by source name if any source returns 0 jobs
- Calls `services.digest.send_digest()` after completion
- `LLM_MIN` raised to 70
- Embedding `min_score` lowered to 65.0 (LLM is the quality gate, not embedding)

**Why:** Fuzzy dedup was missing; same role at same company appeared 3× from different boards. Auto-digest needed a hook at the end of each run.

---

## backend/main.py — RUN_ON_STARTUP

**What changed:**
- Added `RUN_ON_STARTUP` env var check in lifespan; if `true`, fires `run_job_search()` 30s after boot via `asyncio.create_task`

**Why:** Useful for initial setup and staging deploys where you want one search immediately without waiting for the scheduler.

---

## backend/services/hn_hiring.py — NEW FILE

**What changed:** Created from scratch.
- Uses Algolia API to discover the current "Who is Hiring" thread ID (no hardcoded month/year)
- Fetches top-level comments from HN Firebase API
- Filters: must contain "remote" + at least one of `_KEEP_KEYWORDS` (java, golang, kafka, etc.)
- Rejects: staffing, consulting, outsourcing, "no remote", "onsite only"
- Parses company + title from pipe-format, dash-format, or "Company is hiring" patterns
- Source tag: `hn_hiring`

**Why:** Old `job_boards_hn.py` used hardcoded month strings and broke between months. Algolia-based discovery is always current.

---

## backend/services/himalayas_jobs.py — NEW FILE

**What changed:** Created from scratch.
- 8 role-specific queries: backend java, backend golang, kafka, api platform, platform engineer, senior backend remote, fintech backend, data pipeline
- Endpoint: `https://himalayas.app/api/jobs?q={query}&limit=100&remote=true`
- Filters to jobs posted in last 10 days (`MAX_DAYS=10`)
- Source tag: `himalayas`

**Why:** Himalayas is a high-quality remote-only board with good startup coverage, missing from the original source list.

---

## backend/services/job_boards.py — Remotive rewrite

**What changed:**
- Replaced single generic Remotive fetch with 8 targeted queries: `backend java`, `golang backend`, `kafka engineer`, `api platform`, `platform engineering`, `distributed systems`, `data infrastructure`, `fintech backend`
- All queries use `category=software-dev` to reduce noise
- All 8 queries run in parallel; results deduplicated by URL
- Location filter made lenient: only hard-blocks explicit country-only restrictions
- `extract_skill_keywords` applied to `_build_keyword_sets()`

**Why:** Original fetch returned mostly React/Node.js jobs. Category filter + targeted queries return relevant backend roles.

---

## backend/services/job_boards_ats.py — slug expansion + 404 handling

**What changed:**
- Greenhouse: added ~30 new slugs (treblle, apitally, redpanda, materialize, rudderstack, svix, hookdeck, and others)
- Lever: added ~30 new slugs (pagerduty, incident-io, firehydrant, grafana-labs, honeycomb, clickhouse, neon, planetscale, supabase, etc.)
- Ashby: added ~25 new slugs (inngest, trigger-dev, windmill, prefect, dagster, estuary, meroxa, decodable, sequin, cube, metabase, etc.)
- `_fetch_greenhouse_company()` now returns `[]` on HTTP 404 instead of raising
- `extract_skill_keywords` applied

**Why:** ATS boards have the highest signal-to-noise ratio for startup jobs. More slugs = more targeted coverage. 404 handling prevents one dead slug from crashing the batch.

---

## backend/services/job_boards_hn.py, job_boards_yc.py, job_boards_extra.py — skill tokenizer

**What changed:**
- All three now import and use `extract_skill_keywords` from `date_utils.py` in `_build_keyword_sets()` / equivalent

**Why:** Raw skill strings like "Java 17" were passed as single tokens. `extract_skill_keywords` splits them so "java 17" → ["java"], enabling accurate substring matching.

---

## backend/services/digest.py — NEW FILE

**What changed:** Created from scratch.
- Writes a plain-text digest to `backend/digests/YYYY-MM-DD.txt` after each search run
- Only fires when at least one job scores ≥ 70 (= 7/10)
- Top 15 jobs shown with score, company, title, URL, first match reason, salary
- Sends via SMTP (STARTTLS) if `SMTP_HOST/USER/PASS/DIGEST_EMAIL` are configured
- Falls back to disk-only if SMTP not configured

**Why:** Enables passive monitoring — open the digest file (or email) instead of logging into the UI after every run.

---

## frontend/src/pages/JobSearch.jsx — complete rewrite

**What changed:**
- Score summary bar: "X Strong Match" (green), "X Good Match" (amber), toggle for weak matches
- `showWeak` state — weak jobs (<60) hidden by default
- KEYWORD_CHIPS: Java/Go, Kafka, API Platform, Fintech, Remote Only — client-side filter
- Source filter tabs now include HN Hiring and Himalayas
- Sort order: Strong (≥80) → Good (60–79) → Weak
- `remoteOnly` toggle removed (replaced by Remote Only chip)
- `limit=200`, `min_score=70` fetch params
- Removed manual Re-score trigger in favour of auto-scoring

**Why:** Score visibility is the most important UX signal. Filter chips let you narrow to relevant sub-stacks without hitting the backend.

---

## frontend/src/components/JobCard.jsx — complete rewrite

**What changed:**
- `ScoreBadge` component: ≥80 = green "Strong Match", 60–79 = amber "Good Match", <60 = grey "Weak Match"; score displayed as `Math.round(score/10)/10`
- `daysAgo()` utility shows "X days ago" next to source badge using `fetched_at`
- `copyColdEmailTarget()` button copies `Company — Title\nURL` to clipboard; shows checkmark on success
- `KeywordBadge` replaces `KeywordCircle` for non-AI-scored jobs

**Why:** Job cards previously had no score context. Badge + age + copy button are the three most-used actions when triaging results.

---

## .env.example — new variables

**Added:**
- `XAI_API_KEY` — for grok LLM provider
- `RUN_ON_STARTUP=false` — trigger search on boot
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `DIGEST_EMAIL` — digest email config
