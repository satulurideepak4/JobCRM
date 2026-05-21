# JobCRM

A job search CRM that lives entirely on your laptop. No subscriptions, no cloud, no data leaving your machine.

---

## Why this exists

Job hunting is chaotic. You send cold emails and forget who you sent them to. You apply on five different job boards and lose track of which companies replied. You mean to follow up but never do. Three weeks later you realize you ghosted a company that actually liked you.

Most people manage this in a spreadsheet. That works until it doesn't.

JobCRM gives you the structure of a CRM without the overhead of a SaaS product. It reads your Gmail automatically, tracks every company you have touched, finds new jobs that match your profile, and reminds you when to follow up. Everything is local. You own your data.

---

## Running

**See [RUNNING.txt](./RUNNING.txt) for full setup and start instructions.**

Short version:

```bash
cp .env.example .env   # fill in LLM_PROVIDER + API key
./start.sh             # starts Postgres, backend, frontend
```

```
Frontend  →  http://localhost:4444
Backend   →  http://localhost:4445
API docs  →  http://localhost:4445/docs
```

---

## What it does

- Reads your Gmail and figures out which emails are job-related
- Tracks every company through a pipeline: cold email → applied → reply → interviewing → offer
- Detects interview invites, test links, rejections and ghosting automatically
- Searches 7+ job sources and scores each job against your profile with AI
- Writes personalized cold emails for you
- Auto-creates follow-up reminders when a company goes silent for 7 days
- Marks companies as ghosted after 21 days of no reply

---

## Architecture

```
┌──────────────┐         ┌──────────────────┐         ┌──────────┐
│   React 18   │  HTTP   │  FastAPI (Python) │   SQL   │ Postgres │
│   port 4444  │◄───────►│   port 4445       │◄───────►│  port    │
│   (Vite)     │         │                  │         │  5431    │
└──────────────┘         └────────┬─────────┘         └──────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
               Gmail API      LLM API      Job Boards
             (OAuth 2.0)   (your choice)  (Greenhouse,
                                           Lever, etc.)
```

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TanStack Query |
| Backend | Python 3.11 + FastAPI |
| Database | PostgreSQL 15 (Docker) |
| AI | Gemini / OpenAI / Anthropic (pluggable via `LLM_PROVIDER`) |
| Job sources | Remotive, Arbeitnow, JSearch, Greenhouse, Lever, Ashby, Workday |
| Gmail | OAuth 2.0 — token stored locally, never leaves your machine |
| Scheduling | APScheduler — daily sync at 9:30 PM |

---

## Gmail sync

Runs daily at 9:30 PM and on-demand via Sync Now.

```
Sent folder scan
  └─► AI classifies each sent email (cold email? application? follow-up?)
      └─► Upsert company record + set status

Thread-based inbox scan  (primary — catches all replies regardless of sender domain)
  └─► For every known thread, fetch all incoming messages
      └─► AI classifies: interview invite / confirmation / reply / rejection

ATS inbox scan  (fallback — catches Greenhouse, Lever, Codility, HackerRank etc.)
  └─► Match known ATS sender domains
      └─► Extract company from subject/body → classify

Ghosting detection  →  no reply in 21 days = ghosted
Follow-up creation  →  no update in 7 days = reminder
```

Rules:
- Each email is processed exactly once (tracked by Gmail message ID)
- Status never goes backwards — interviewing cannot drop back to applied
- Incremental — subsequent syncs only scan since the last successful run

---

## Job search

Runs daily at 9:30 PM and on-demand via Search Now.

```
Profile (role + skills)
  └─► AI generates 5 search queries
      └─► 3 sources fetched in parallel:
            ├─ Job board APIs  (Remotive, Arbeitnow, JSearch)
            ├─ ATS direct APIs (Greenhouse, Lever, Ashby — no keys needed)
            └─ Workday agent   (LangChain + DuckDuckGo web search)
      └─► Deduplicate by URL + SHA-256(company + title)
      └─► Skip companies already in your pipeline
      └─► Local keyword filter (instant, no LLM)
      └─► Save to DB — "Score with AI" button triggers LLM re-ranking
```

---

## Company pipeline

```
Cold Email Sent
      │
      ▼
   Applied
      │
      ▼
Confirmation Received
      │
      ▼
  Reply Received
      │
      ├──────────────► Interviewing ──► Offer
      │
      ├──────────────► Rejected
      │
      └──────────────► Ghosted (auto, 21 days silence)
```

---

## Project structure

```
JobCRM/
│
├── backend/
│   ├── main.py                        # App entry, lifespan, routers
│   ├── models.py                      # All DB models and enums
│   ├── llm_service.py                 # Single file for all AI calls
│   ├── scheduler.py                   # Daily sync cron
│   │
│   ├── agents/
│   │   ├── gmail_agent.py             # Gmail sync logic
│   │   └── job_search_agent.py        # Job search orchestration
│   │
│   ├── services/
│   │   ├── gmail_service.py           # OAuth + Gmail API calls
│   │   ├── job_boards.py              # Remotive, Arbeitnow, JSearch
│   │   ├── job_boards_ats.py          # Greenhouse, Lever, Ashby
│   │   └── scorer.py                  # Local keyword job filter
│   │
│   └── routes/                        # One file per feature area
│
├── frontend/src/
│   ├── pages/                         # Dashboard, Applications, JobSearch …
│   ├── components/                    # Sidebar, KanbanBoard, StatCard …
│   └── api/client.js                  # Axios instance (baseURL: 4445)
│
├── docker-compose.yml                 # PostgreSQL only
├── start.sh                           # Single command to run everything
├── .env.example                       # Copy to .env and fill in keys
├── RUNNING.txt                        # Full setup, commands, troubleshooting
└── README.md
```

---

## Adding companies to ATS search

`backend/services/job_boards_ats.py` has three slug lists: `GREENHOUSE_SLUGS`, `LEVER_SLUGS`, `ASHBY_SLUGS`. Add a company by finding its slug in the job board URL:

- Greenhouse → `boards.greenhouse.io/<slug>`
- Lever → `jobs.lever.co/<slug>`
- Ashby → `jobs.ashbyhq.com/<slug>`

---

## What this is not

This does not apply to jobs for you. It does not send emails for you. It is a personal CRM, a tracker, and a research assistant. You stay in control of every action that matters.
