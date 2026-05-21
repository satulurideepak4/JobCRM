# JobCRM

A job search CRM that lives entirely on your laptop. No subscriptions, no cloud, no data leaving your machine. Just you, your job search, and a tool that actually works the way you think.

---

## Why this exists

Job hunting is chaotic. You send cold emails and forget who you sent them to. You apply on five different job boards and lose track of which companies replied. You mean to follow up but never do. Three weeks later you realize you ghosted a company that actually liked you.

Most people manage this in a spreadsheet. That works until it doesn't.

JobCRM gives you the structure of a CRM without the overhead of a SaaS product. It reads your Gmail automatically, tracks every company you have touched, finds new jobs that match your profile, and reminds you when to follow up. Everything is local. You own your data.

---

## What it actually does

```
┌─────────────────────────────────────────────────────────────────┐
│                         JobCRM                                  │
│                                                                 │
│   Gmail Sync    +    Job Search    +    Email Drafting          │
│       │                  │                    │                 │
│       ▼                  ▼                    ▼                 │
│   Tracks who        Finds jobs           Writes cold            │
│   you emailed       that match           emails and             │
│   and replied       your profile         follow-ups             │
│                                                                 │
│              All stored locally in PostgreSQL                   │
└─────────────────────────────────────────────────────────────────┘
```

Here is the full feature list:

- Reads your Gmail and figures out which emails are job-related
- Tracks every company you have contacted, applied to, or heard back from
- Shows everything in a Kanban pipeline (cold email sent > applied > reply > interviewing > offer)
- Searches 7+ job sources and scores each job against your profile using AI
- Writes personalized cold emails for you
- Auto-detects when you need to follow up (no reply in 7 days)
- Marks companies as ghosted after 21 days of silence
- All of this runs on your machine. Nothing goes to a third party server.

---

## The tech behind it

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
| AI | Gemini / OpenAI / Anthropic (your choice) |
| Job Search | Remotive, Arbeitnow, JSearch, Greenhouse, Lever, Ashby, Workday |
| Gmail | Gmail API with OAuth 2.0 |
| Scheduling | APScheduler (runs inside FastAPI) |

---

## How to run it

### What you need first

- Docker Desktop (for PostgreSQL)
- Python 3.11 or higher
- Node.js 18 or higher
- An API key for at least one LLM provider

### Setup

```bash
git clone <repo-url>
cd JobCRM

cp .env.example .env
```

Open `.env` and set these two things at minimum:

```
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key-here
```

Then start everything:

```bash
chmod +x start.sh
./start.sh
```

That's it. The script handles the database, the backend, and the frontend in the right order.

```
Frontend  ->  http://localhost:4444
Backend   ->  http://localhost:4445
API docs  ->  http://localhost:4445/docs
```

---

## First time flow

```
Step 1          Step 2           Step 3          Step 4
  │               │                │               │
  ▼               ▼                ▼               ▼
Fill in        Upload           Connect         Hit Sync
profile        resume           Gmail           and Search
(name,         (PDF, auto       (OAuth,         on the
role,          extracts         one time)       Dashboard
skills)        skills)
```

Go to `http://localhost:4444/profile` and start from the top. The profile drives everything else. Gmail sync and job search will both refuse to run if no profile exists.

---

## How Gmail sync works

This runs daily at 9:30 PM and whenever you click Sync Now.

```
                    ┌──────────────────┐
                    │   Gmail Sync     │
                    └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
       Scan SENT folder              Scan INBOX
       (last 60 days)                (last 60 days)
              │                             │
              ▼                             ▼
       AI classifies each            Match sender to
       sent email:                   known companies
       cold email?                         │
       application?                        ▼
              │                    AI classifies:
              ▼                    confirmation?
       Upsert company              reply? rejection?
       record + set status                 │
                                           ▼
                                   Update company status
                                   (never downgrade)
                                           │
                    ┌──────────────────────┘
                    │
                    ▼
            Ghosting detection
            (no reply in 21 days = ghosted)
                    │
                    ▼
            Follow-up creation
            (no update in 7 days = reminder)
```

A few important rules the sync follows:

- It never processes the same email twice (tracked by Gmail message ID)
- Status never goes backwards. If a company is at "interviewing", a new email cannot drop them back to "cold email sent"
- Emails are processed in chronological order so status transitions are always correct

---

## How job search works

This also runs daily at 9:30 PM and whenever you click Search Now.

```
Your Profile
     │
     ▼
AI generates 5 search queries
     │
     ├──────────────────────────────────────────────────┐
     │                                                  │
     ▼                                                  ▼
Job Board APIs                                 ATS Platform APIs
(run in parallel)                              (run in parallel)
     │                                                  │
     ├─ Remotive                                        ├─ Greenhouse (~150 companies)
     ├─ Arbeitnow                                       ├─ Lever     (~150 companies)
     └─ JSearch (RapidAPI)                              ├─ Ashby     (~150 companies)
                                                        └─ Workday   (via web search)
     │                                                  │
     └──────────────────┬───────────────────────────────┘
                        │
                        ▼
              Deduplicate all results
              (SHA-256 hash of company + title)
                        │
                        ▼
              Filter out companies
              you already applied to
                        │
                        ▼
              AI scores each job (0 to 100)
              against your profile
                        │
                        ▼
              Keep only score >= 50
              Sort by score descending
                        │
                        ▼
              Save to database
```

Greenhouse, Lever and Ashby are queried directly through their public APIs with no keys needed. All 450+ company endpoints fire concurrently so the whole thing completes fast. Workday has no public API so a LangChain agent uses web search to find postings there.

---

## How cold email drafting works

```
You provide:                   AI generates:
  company name        ──────►    subject line
  target role                    email body
  job description                (under 150 words,
  (optional)                      human tone)
                                       │
                                       ▼
                              You review the draft
                                       │
                                       ▼
                              Copy to clipboard
                                       │
                                       ▼
                              Send from your own Gmail
                                       │
                                       ▼
                              Click "Mark as Sent"
                              (creates company record
                               with status: cold email sent)
```

The tool never sends emails on your behalf. You stay in control of what goes out.

---

## The company pipeline

Every company you track moves through these stages:

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
      └──────────────► Ghosted (auto after 21 days)
```

Gmail sync moves companies forward automatically based on what lands in your inbox. You can also change status manually. The system never moves a company backwards.

---

## LLM providers

Every AI call in the app goes through a single file (`backend/llm_service.py`). Nothing else imports an AI SDK directly. This means you can switch providers by changing one line in your `.env`.

```
LLM_PROVIDER=gemini     uses gemini-1.5-flash     (Google AI Studio)
LLM_PROVIDER=openai     uses gpt-4o-mini          (OpenAI)
LLM_PROVIDER=anthropic  uses claude-3-5-haiku      (Anthropic)
```

All three support automatic retries with exponential backoff on rate limit errors. If you ask for JSON output in the prompt, the response is automatically parsed into a dict.

---

## Job sources at a glance

| Source | Type | Key needed |
|---|---|---|
| Remotive | Remote-first job board | No |
| Arbeitnow | EU and global remote | No |
| JSearch | Broad aggregator | Yes (RapidAPI free tier) |
| Greenhouse | Direct ATS API | No |
| Lever | Direct ATS API | No |
| Ashby | Direct ATS API | No |
| Workday | Web search via AI agent | No |

---

## Gmail OAuth setup (one time)

```
1. Go to console.cloud.google.com
        │
        ▼
2. Create a project
   Enable the Gmail API
        │
        ▼
3. Credentials > Create OAuth 2.0 Client ID
   Type: Web application
        │
        ▼
4. Add authorized redirect URI:
   http://localhost:4445/auth/gmail/callback
        │
        ▼
5. Copy Client ID and Client Secret into .env
        │
        ▼
6. Profile page > Connect Gmail
   Approve in browser
        │
        ▼
   Done. Token saved locally in backend/gmail_token.json
```

---

## Environment variables

```
# Required
DATABASE_URL=postgresql://jobcrm:jobcrm@localhost:5431/jobcrm
LLM_PROVIDER=gemini

# One of these (matching LLM_PROVIDER)
GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Optional but recommended
RAPIDAPI_KEY=          (JSearch job board)
GMAIL_CLIENT_ID=       (Gmail sync)
GMAIL_CLIENT_SECRET=   (Gmail sync)
GMAIL_REDIRECT_URI=http://localhost:4445/auth/gmail/callback

# Scheduler (default is 9:30 PM)
SYNC_HOUR=21
SYNC_MINUTE=30
```

---

## Project structure

```
JobCRM/
│
├── backend/
│   ├── main.py                  # App entry point, lifespan, routers
│   ├── models.py                # All database models and enums
│   ├── database.py              # DB connection and session
│   ├── llm_service.py           # Single file for all AI calls
│   ├── scheduler.py             # Daily sync trigger
│   │
│   ├── agents/
│   │   ├── gmail_agent.py       # Full Gmail sync logic
│   │   └── job_search_agent.py  # Job search orchestration
│   │
│   ├── services/
│   │   ├── gmail_service.py     # OAuth and Gmail API calls
│   │   ├── job_boards.py        # Remotive, Arbeitnow, JSearch
│   │   ├── job_boards_ats.py    # Greenhouse, Lever, Ashby direct APIs
│   │   └── scorer.py            # LLM job scoring
│   │
│   └── routes/
│       ├── profile.py
│       ├── applications.py
│       ├── jobs.py
│       ├── emails.py
│       ├── followups.py
│       ├── dashboard.py
│       └── gmail.py
│
├── frontend/
│   └── src/
│       ├── pages/               # Dashboard, Applications, JobSearch, etc.
│       ├── components/          # Sidebar, KanbanBoard, JobCard, StatCard
│       └── api/client.js        # Axios instance
│
├── docker-compose.yml           # PostgreSQL only
├── start.sh                     # One command to run everything
├── .env.example                 # Copy this to .env
├── RUNNING.txt                  # Quick reference for ports and commands
└── README.md                    # This file
```

---

## Adding more companies to ATS search

The file `backend/services/job_boards_ats.py` has three lists of company slugs: `GREENHOUSE_SLUGS`, `LEVER_SLUGS`, and `ASHBY_SLUGS`. If you want to add a company, just find their slug and add it.

For Greenhouse, the slug is the part after `boards.greenhouse.io/` in their job board URL.
For Lever, it is the part after `jobs.lever.co/`.
For Ashby, it is the part after `jobs.ashbyhq.com/`.

---

## What this is not

This is not a job board. It does not apply to jobs for you. It does not send emails for you. It is a personal CRM, a tracker, and a research assistant. You stay in the loop on every action that matters.
