# JobCRM

A job search CRM that runs entirely on your laptop. No subscriptions, no cloud, no data leaving your machine.

---

## Why this exists

Job hunting is chaotic. You apply on five different job boards and lose track of which companies replied. You forget to follow up. Three weeks later you realise you ghosted a company that actually liked you.

Most people manage this in a spreadsheet. That works until it doesn't.

JobCRM gives you the structure of a CRM without the overhead of a SaaS product. It reads your Gmail automatically, tracks every company you have touched, finds new jobs that match your resume, scores them with AI, and reminds you when to follow up. Everything runs locally. You own your data.

---

## Running

```bash
cp .env.example .env   # fill in LLM_PROVIDER + API key
./start.sh             # starts Postgres, backend, frontend
```

```
Frontend  →  https://localhost:4444   ← HTTPS required for mic / speech API
Backend   →  http://localhost:4445
API docs  →  http://localhost:4445/docs
```

> **Chrome will show a certificate warning on first visit** (self-signed cert).
> Click **Advanced → Proceed to localhost** to continue.

See [RUNNING.txt](./RUNNING.txt) for full setup instructions.

---

## Features

### Application Tracker
- Kanban board: Cold Email → Applied → Replied → Interviewing → Offer / Rejected / Ghosted
- Status never goes backwards — interviewing cannot drop back to applied
- Auto-ghosted after 21 days of silence
- Auto follow-up reminders after 7 days with no update

### Gmail Sync
- Reads your Gmail and classifies every job-related email using AI
- Detects interview invites, confirmations, rejections, test links (Greenhouse, Codility, HackerRank)
- Thread-based scan — catches replies regardless of sender domain
- Runs daily at 9:30 PM and on-demand via Sync Now
- Each email processed exactly once (tracked by Gmail message ID)
- OAuth 2.0 — token stored locally, never leaves your machine

### Job Search (resume-based)
Searches **8 sources in parallel**, filters and scores every job against your actual resume:

| Source | Notes |
|---|---|
| Remotive | Remote-only board, 100 results per query |
| Arbeitnow | 7 pages (~700 jobs), no key needed |
| JSearch (RapidAPI) | Indeed/LinkedIn aggregator, optional |
| RemoteOK | Startup-heavy, tag-based search, no key needed |
| Greenhouse | ATS direct API, no auth, role-aware company selection |
| Lever | ATS direct API, no auth, role-aware company selection |
| Ashby | ATS direct API, no auth, role-aware company selection |
| Workday | LangChain + DuckDuckGo web search agent |
| HN Who's Hiring | Monthly thread scraper, startup-focused |

**Two-stage filtering:**
1. **Local keyword filter** — instant, no LLM, minimum 5-point threshold
2. **AI scorer** — auto-triggers after search, batches 20 jobs per LLM call, uses your full resume text for semantic matching

### Mock Interviews
- AI interviewer tailored to the specific job and your resume
- Three modes: Behavioral, Technical, Mixed
- Configurable question count (5 / 7 / 10)
- Optional: paste a job description for targeted questions
- Voice-driven: speech recognition + text-to-speech for natural conversation
- Silence detection: auto-submits answer after 3 seconds of quiet
- Manual Submit Answer button if you want to submit early
- Text input fallback for non-Chrome browsers or when mic is unavailable
- Debrief with personalised feedback + full Q&A transcript

### Follow-ups
- Tracks all companies you have emailed
- Auto-generates follow-up suggestions when a company goes quiet
- One-click to draft a follow-up

### Theme
Full dark / light mode on every page.

---

## Architecture

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────┐
│    React 18      │  HTTPS  │  FastAPI (Python) │   SQL   │ Postgres │
│  port 4444       │◄───────►│   port 4445       │◄───────►│  port    │
│  Vite + HTTPS    │         │                  │         │  5431    │
└──────────────────┘         └────────┬─────────┘         └──────────┘
                                      │
                      ┌───────────────┼────────────────┐
                      │               │                │
                      ▼               ▼                ▼
                 Gmail API         LLM API         Job Boards
               (OAuth 2.0)     (pluggable)       (8 sources)
```

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TanStack Query + Tailwind CSS v3 |
| Backend | Python 3.11 + FastAPI + SQLAlchemy |
| Database | PostgreSQL 15 (Docker) |
| AI | Gemini / OpenAI / Anthropic (pluggable via LLM_PROVIDER) |
| Job sources | Remotive, Arbeitnow, JSearch, RemoteOK, Greenhouse, Lever, Ashby, Workday, HN |
| Gmail | OAuth 2.0 — token stored locally |
| Scheduling | APScheduler — daily sync at 9:30 PM |
| Voice | Web Speech API (Chrome) + browser TTS |

---

## Gmail sync pipeline

```
Sent folder scan
  └─► AI classifies each sent email (cold email? application? follow-up?)
      └─► Upsert company record + set status

Thread-based inbox scan  (catches all replies regardless of sender domain)
  └─► For every known thread, fetch all incoming messages
      └─► AI classifies: interview invite / confirmation / reply / rejection

ATS inbox scan  (catches Greenhouse, Lever, Codility, HackerRank etc.)
  └─► Match known ATS sender domains
      └─► Extract company from subject/body → classify

Ghosting detection  →  no reply in 21 days = ghosted
Follow-up creation  →  no update in 7 days = reminder
```

---

## Job search pipeline

```
Profile (role + skills + resume text)
  └─► LLM generates 5 diverse search queries
      └─► 8 sources fetched in parallel (~30s)
      └─► Deduplicate by URL + SHA-256(company + title)
      └─► Skip companies already in your pipeline
      └─► Local keyword filter  (instant, no LLM)
      └─► Save to DB
      └─► Auto-trigger AI scoring
          └─► LLM batch scorer (20 jobs per call, uses resume text)
              └─► Results sorted by match score in Job Search page
```

**Local filter scoring (minimum 5 to pass):**

| Signal | Points |
|---|---|
| Role keyword in job title | 3 |
| Primary skill match | 3 |
| Secondary skill match | 2 |
| Remote preference match | 2 |
| Salary listed | 1 |
| Company website present | 1 |
| Tag match | 1 |

**AI scorer rubric (0–100):**
- 85–100: Near-perfect match with resume
- 70–84: Strong match, most requirements met
- 50–69: Decent match, some gaps
- 30–49: Stretch role
- 0–29: Poor match

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
      └──────────────► Ghosted  (auto, 21 days silence)
```

---

## Mock interview flow

```
Setup page
  └─► Choose mode: Behavioral / Technical / Mixed
  └─► Set question count: 5 / 7 / 10
  └─► Optional: paste job description for targeted questions
  └─► Start Interview

Interview room
  └─► AI speaks question via TTS
  └─► Mic opens automatically after speech finishes
  └─► You answer by speaking (or typing in text mode)
  └─► 3-second silence → auto-submit answer
  └─► AI processes answer → speaks next question
  └─► Repeat until done

Debrief
  └─► Personalised written feedback
  └─► Full Q&A transcript (collapsible)
```

> **Mic note:** Chrome's Web Speech API requires HTTPS. Always use `https://localhost:4444`.
> On first visit, accept the certificate. On first interview, allow microphone access when prompted.

---

## Project structure

```
JobCRM/
│
├── backend/
│   ├── main.py                    # App entry, lifespan, routers
│   ├── models.py                  # All DB models and enums
│   ├── llm_service.py             # Single file for all LLM calls
│   ├── scheduler.py               # Daily sync cron (APScheduler)
│   │
│   ├── agents/
│   │   ├── gmail_agent.py         # Gmail sync orchestration
│   │   └── job_search_agent.py    # Job search + auto-scoring pipeline
│   │
│   ├── services/
│   │   ├── gmail_service.py       # OAuth + Gmail API calls
│   │   ├── job_boards.py          # Remotive, Arbeitnow, JSearch, RemoteOK
│   │   ├── job_boards_ats.py      # Greenhouse, Lever, Ashby (role-aware slugs)
│   │   ├── job_boards_hn.py       # HN Who's Hiring scraper
│   │   └── scorer.py              # Local keyword filter + LLM batch scorer
│   │
│   └── routes/                    # One file per feature area
│       ├── jobs.py
│       ├── applications.py
│       ├── gmail.py
│       ├── profile.py
│       └── interview.py
│
├── frontend/src/
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Applications.jsx
│   │   ├── JobSearch.jsx
│   │   ├── Emails.jsx
│   │   ├── FollowUps.jsx
│   │   ├── Interview.jsx          # Setup: mode, questions, job description
│   │   ├── InterviewRoom.jsx      # Live interview (voice + text input)
│   │   └── Profile.jsx
│   │
│   ├── components/
│   │   ├── Sidebar.jsx
│   │   ├── KanbanBoard.jsx
│   │   ├── JobCard.jsx
│   │   └── StatCard.jsx
│   │
│   ├── hooks/
│   │   ├── useSpeechRecognition.js   # Web Speech API: silence detection, auto-submit
│   │   └── useSpeechSynthesis.js     # Browser TTS: sentence-by-sentence, fallback timer
│   │
│   ├── contexts/
│   │   └── ThemeContext.jsx          # Dark / light mode
│   │
│   └── api/client.js                 # Axios instance (baseURL: 4445)
│
├── docker-compose.yml             # PostgreSQL only
├── start.sh                       # One command to start everything
├── .env.example                   # Copy to .env, fill in keys
├── RUNNING.txt                    # Full setup, troubleshooting, known issues
└── README.md
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `LLM_PROVIDER` | ✅ | `gemini` / `openai` / `anthropic` |
| `GEMINI_API_KEY` | if gemini | Google AI Studio key |
| `OPENAI_API_KEY` | if openai | OpenAI key |
| `ANTHROPIC_API_KEY` | if anthropic | Anthropic key |
| `GMAIL_CLIENT_ID` | for Gmail sync | Google OAuth client ID |
| `GMAIL_CLIENT_SECRET` | for Gmail sync | Google OAuth client secret |
| `GMAIL_REDIRECT_URI` | for Gmail sync | `http://localhost:4445/auth/gmail/callback` |
| `RAPIDAPI_KEY` | optional | Enables JSearch (Indeed/LinkedIn aggregator) |
| `DATABASE_URL` | auto-set | `postgresql://jobcrm:jobcrm@localhost:5431/jobcrm` |

---

## Adding companies to ATS search

`backend/services/job_boards_ats.py` has slug lists grouped by role category (`UNIVERSAL_SLUGS`, `BACKEND_SLUGS`, `FRONTEND_SLUGS`, `AI_ML_SLUGS`, `DEVOPS_SLUGS`, `DATA_SLUGS`). The search automatically selects the relevant categories based on your profile role and skills — you don't need to pick manually.

To add a company, find its slug from the job board URL:

- Greenhouse: `boards.greenhouse.io/<slug>/jobs`
- Lever: `jobs.lever.co/<slug>`
- Ashby: `jobs.ashbyhq.com/<slug>`

---

## What this is not

This does not apply to jobs for you. It does not send emails without your review. It is a personal CRM, a job tracker, a research tool, and an interview coach. You stay in control of every action that matters.
