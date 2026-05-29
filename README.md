# JobCRM

**A personal job search command centre that runs entirely on your laptop.**

No SaaS subscriptions. No data in the cloud. No vendor lock-in. Your Gmail, your resume, your job pipeline — all local, all private.

---

## What it does

Job hunting across multiple boards is chaotic. You apply somewhere, forget to follow up, miss a reply, and lose track of which companies are at which stage. Most people end up in a spreadsheet. That works until it doesn't.

JobCRM replaces the spreadsheet with a purpose-built tool that:

- **Reads your Gmail** and automatically moves every company you touch through a structured pipeline
- **Finds new jobs** across 10+ sources, scores them against your actual resume with AI, and surfaces only the relevant ones
- **Tailors your resume** to any job description in seconds using GPT-4o or Claude — preserving your original layout, fonts, and links exactly
- **Generates cover letters** on demand, specific to each role and company
- **Runs mock interviews** with a fully voice-driven AI interviewer that asks questions based on the job you are targeting
- **Tracks follow-ups** and tells you when a company has gone quiet

Everything runs on `localhost`. Nothing leaves your machine except the API calls you explicitly configure.

---

## Quick start

```bash
git clone <repo>
cd JobCRM
cp .env.example .env     # add your API keys
./start.sh               # starts Postgres + backend + frontend
```

| Service | URL |
|---|---|
| Frontend | `https://localhost:4444` |
| Backend API | `http://localhost:4445` |
| API docs (Swagger) | `http://localhost:4445/docs` |

> **Chrome will show a certificate warning** (self-signed cert for HTTPS).  
> Click **Advanced → Proceed to localhost** to continue. HTTPS is required for the microphone in the interview feature.

See [RUNNING.txt](./RUNNING.txt) for full setup, troubleshooting, and known issues.

---

## Features

### Dashboard

![Dashboard](docs/screenshots/dashboard.png)

The home screen gives you the full picture at a glance:

- **Stats row** — Total applied, response rate (% of companies that replied), currently interviewing, follow-ups overdue
- **Pipeline kanban** — All companies across every stage: Cold Email → Applied → Confirmed → Reply → Interviewing → Offer / Rejected
- **Today's Matches** — Top AI-scored jobs from the latest search run, with match score
- **Pending Follow-ups** — Companies that need attention, highlighted in amber when overdue
- **Recent Activity** — Latest status changes (rejections, confirmations, replies) with timestamps

---

### Job Search

![Job Search](docs/screenshots/job-search.png)

Searches **10+ sources in parallel**, deduplicates, filters, and AI-scores every result against your resume. Results appear on a card grid ranked by match quality.

**Sources:**

| Source | Notes |
|---|---|
| Remotive | Remote-only board, 8 role-specific queries |
| Arbeitnow | 7 pages (~700 jobs), no key required |
| JSearch (RapidAPI) | Indeed + LinkedIn aggregator (optional) |
| RemoteOK | Startup-heavy, tag-based, no key required |
| Greenhouse | ATS direct API, 100+ role-aware company slugs |
| Lever | ATS direct API, 100+ role-aware company slugs |
| Ashby | ATS direct API, 100+ role-aware company slugs |
| Workday | LangChain + DuckDuckGo web search agent |
| HN Who's Hiring | Algolia-based auto-discovery of the current monthly thread |
| Himalayas | Remote-only board, 8 targeted backend/streaming queries |

**Three-stage filtering pipeline:**

1. **Hard reject** — instant discard for on-site-only roles, staffing/outsourcing, 7+ years required, pure Node/.NET/PHP stacks
2. **Weighted skill groups** — SKILL_GROUPS matching (Kafka, Java/Go, Spring Boot, API Platform, distributed systems, etc.), minimum score ≥ 4 to pass
3. **AI scorer** — LLM batch scorer (10 jobs per call) using a candidate-specific system prompt built from your live profile and resume text. Scores 1–10.

**Score badges:**
- `STRONG MATCH` (green) — score ≥ 8
- `GOOD MATCH` (amber) — score 6–7
- `WEAK MATCH` (grey, hidden by default) — score < 6

**Each job card shows:** company, title, location badge, salary range, description preview, match score, source, and action buttons: Save, Dismiss, **Tailor** (instant resume tailoring from the card), and **Apply**.

**Fuzzy deduplication:** `difflib.SequenceMatcher` ratio > 0.85 on `company+title` prevents the same role appearing twice from different boards.

**Daily digest:** after each run, a plain-text digest of top matches (score ≥ 7) is written to `backend/digests/YYYY-MM-DD.txt`. Set `SMTP_*` env vars to also receive it by email.

---

### Resume Tailor

![Resume Tailor](docs/screenshots/resume-tailor.png)

Generate a tailored resume and cover letter for any job in seconds — and download it as a `.docx` that looks exactly like your original.

**How it works:**

1. Paste any job description (from any board, anywhere)
2. Enter the company name
3. Choose a generation method:
   - **GPT-4o** (LLM API) — ~3 seconds, ~$0.04 per generation
   - **Claude Agent** (Claude Code CLI, uses your existing Claude subscription) — ~15 seconds, $0 extra cost
   - **Both** — run both in parallel and compare results side by side
4. Optionally add extra instructions ("Focus on Kafka experience", "Highlight Go over Java")
5. Optionally check **Also generate cover letter** for a role-specific letter alongside the resume
6. Click **Generate** — results appear on the right with the tailored summary, matched keywords, and a preview of the cover letter
7. Download resume as `.docx` and/or cover letter as `.docx`

**Template-based generation (preserves your original format):**

Upload your actual resume `.docx` as a base template (one-time setup via the green banner). After that, every tailored resume is generated by opening your original file and replacing only the summary paragraph and bullet points — your fonts, column layout, section headers, hyperlinks (LinkedIn, GitHub, portfolio), and all formatting stay exactly as you designed them.

Without a template, a clean professional document is generated from scratch as a fallback.

**Tailoring is also available directly from job cards** in Job Search — click the **Tailor** button on any card to open a modal with the same generation flow, pre-filled with the job's details.

---

### Mock Interview

![Mock Interview](docs/screenshots/interview.png)

A fully voice-driven AI interviewer that adapts to the specific job you are targeting.

**Setup:**

- **Interview type:** Interview for a Job (role-specific questions from the JD), Practice a Concept (deep dive on a topic or skill), or Both
- **Job source:** pick a saved job from your pipeline, or paste a custom JD
- **Question count:** 5, 8, 10, or 15 questions

**Live interview room:**

- AI speaks each question aloud via browser TTS
- Microphone opens automatically after the question finishes
- You answer by speaking naturally
- **Silence detection** — auto-submits your answer after 3 seconds of quiet
- **Manual submit** — press the button if you want to cut short
- **Text fallback** — type answers if mic is unavailable or on non-Chrome browsers
- Question progress indicator shows where you are in the session

**After the interview:**

- Personalised written feedback for each answer
- Full Q&A transcript (collapsible per question)
- Scores and improvement suggestions

> Microphone requires HTTPS. Always use `https://localhost:4444`. Grant mic access when Chrome prompts on the first interview.

---

### Follow-ups

![Follow-ups](docs/screenshots/follow-ups.png)

Tracks every company that needs a follow-up and surfaces overdue ones prominently.

- Auto-creates a follow-up reminder when a company goes quiet for 7+ days
- **OVERDUE** section highlights companies that have passed their due date (in red)
- **Draft** button — generates a personalised follow-up email ready to send
- **Done** button — marks the follow-up complete and removes it from the queue
- Delete button to dismiss false positives

---

### Gmail Sync

Reads your Gmail and automatically updates your pipeline based on what companies are saying.

- **Sent folder scan** — classifies every sent email (cold email? application confirmation? follow-up?) and upserts a company record
- **Thread-based inbox scan** — for every known thread, fetches all incoming replies regardless of sender domain
- **ATS inbox scan** — matches Greenhouse, Lever, Codility, HackerRank, and other known ATS domains to extract company names and classify events
- **Auto-detects:** interview invites, confirmations, rejections, test links
- **Ghosting detection** — no reply in 21 days = status set to ghosted automatically
- **Follow-up creation** — no update in 7 days = reminder created automatically
- Runs daily at 9:30 PM and on-demand via **Sync Gmail** in the dashboard header
- Each email processed exactly once (tracked by Gmail message ID)
- OAuth 2.0 — token stored locally, never leaves your machine

---

### Application Tracker

Kanban board showing every company across the full pipeline:

```
Cold Email → Applied → Confirmed → Reply Received → Interviewing → Offer
                                                               ↘ Rejected
                                                               ↘ Ghosted (auto, 21 days)
```

- Status never goes backwards (interviewing cannot drop back to applied)
- Cards are drag-and-drop between columns
- Click any card to see full history and update status manually
- Source label shows how the company entered the pipeline (cold_email, job_board, etc.)

---

### Emails

Manages cold outreach and tracks the state of every email you have sent. View email threads, see AI classification labels, and manually override statuses when needed.

---

### Profile

Set up your resume and preferences so every AI feature — job scoring, resume tailoring, interview questions — is personalised to you.

- Upload your resume as a **PDF** (text is extracted and used for job scoring and tailoring prompts)
- Upload your resume as a **`.docx` template** (used by Resume Tailor to preserve your exact format)
- Set your name, current role, skills list, and years of experience
- Set job preferences (remote/hybrid, locations, salary range)

---

## Architecture

```
┌──────────────────────┐        ┌───────────────────────┐        ┌───────────┐
│   React 18 + Vite    │ HTTPS  │   FastAPI (Python)    │  SQL   │ Postgres  │
│   port 4444          │◄──────►│   port 4445           │◄──────►│ port 5431 │
│   TanStack Query     │        │   SQLAlchemy + Alembic│        │ (Docker)  │
│   Tailwind CSS v3    │        │   APScheduler         │        └───────────┘
└──────────────────────┘        └───────────┬───────────┘
                                            │
                        ┌───────────────────┼──────────────────────┐
                        ▼                   ▼                      ▼
                   Gmail API            LLM APIs              Job Boards
                 (OAuth 2.0)    OpenAI / Anthropic /      10+ sources parallel
                               Gemini / Claude CLI
```

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TanStack Query, Tailwind CSS v3, Framer Motion, Lucide Icons |
| Backend | Python 3.11, FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL 15 (Docker) |
| AI — scoring | OpenAI GPT-4o / Gemini / Anthropic (pluggable via `LLM_PROVIDER`) |
| AI — tailoring | GPT-4o via API, or Claude Code CLI subprocess (Claude Pro subscription) |
| AI — interviews | Same LLM provider as scoring |
| Document generation | python-docx (template-based replacement + scratch fallback) |
| Job sources | Remotive, Arbeitnow, JSearch, RemoteOK, Greenhouse, Lever, Ashby, Workday, HN Who's Hiring, Himalayas |
| Gmail | Google OAuth 2.0, token stored locally |
| Scheduling | APScheduler — daily Gmail sync + job search at 9:30 PM |
| Voice | Web Speech API (Chrome) + browser TTS |

---

## Project structure

```
JobCRM/
│
├── backend/
│   ├── main.py                      # App entry point, routers, lifespan
│   ├── models.py                    # All DB models and enums
│   ├── llm_service.py               # Pluggable LLM calls (scoring, classification)
│   ├── scheduler.py                 # Daily sync cron (APScheduler)
│   │
│   ├── agents/
│   │   ├── gmail_agent.py           # Gmail sync orchestration
│   │   └── job_search_agent.py      # Job search + auto-scoring pipeline
│   │
│   ├── services/
│   │   ├── resume_tailor.py         # GPT-4o and Claude Agent tailoring paths
│   │   ├── docx_generator.py        # Template-based + scratch .docx generation
│   │   ├── scorer.py                # SKILL_GROUPS filter + LLM batch scorer
│   │   ├── gmail_service.py         # OAuth + Gmail API calls
│   │   ├── interview_service.py     # Question generation + feedback
│   │   ├── job_boards.py            # Remotive, Arbeitnow, JSearch, RemoteOK
│   │   ├── job_boards_ats.py        # Greenhouse, Lever, Ashby (100+ role-aware slugs)
│   │   ├── job_boards_hn.py         # HN Who's Hiring (Algolia thread auto-discovery)
│   │   ├── job_boards_extra.py      # Additional job sources
│   │   ├── job_boards_yc.py         # YC-backed company jobs
│   │   ├── himalayas_jobs.py        # Himalayas remote board
│   │   ├── embedder.py              # Semantic similarity embeddings
│   │   ├── digest.py                # Daily digest writer + SMTP sender
│   │   └── date_utils.py            # Skill keyword tokenizer, date helpers
│   │
│   ├── routes/                      # One file per feature area
│   │   ├── jobs.py
│   │   ├── applications.py
│   │   ├── gmail.py
│   │   ├── profile.py               # Resume upload (PDF + .docx template)
│   │   ├── interview.py
│   │   ├── tailor.py                # Resume tailoring + cover letter + download
│   │   ├── emails.py
│   │   ├── followups.py
│   │   └── dashboard.py
│   │
│   ├── migrations/                  # Alembic DB migrations
│   └── uploads/                     # Uploaded resume files (PDF + .docx template)
│
├── frontend/src/
│   ├── pages/
│   │   ├── Dashboard.jsx            # Stats, pipeline kanban, matches, follow-ups
│   │   ├── Applications.jsx         # Full application tracker
│   │   ├── JobSearch.jsx            # Job cards with scoring + tailor/apply buttons
│   │   ├── ResumeTailor.jsx         # Custom JD tailoring page
│   │   ├── Emails.jsx               # Cold email and outreach tracker
│   │   ├── FollowUps.jsx            # Follow-up queue with overdue highlighting
│   │   ├── Interview.jsx            # Mock interview setup
│   │   ├── InterviewRoom.jsx        # Live voice interview room + debrief
│   │   └── Profile.jsx              # Resume upload + preferences
│   │
│   ├── components/
│   │   ├── Sidebar.jsx
│   │   ├── KanbanBoard.jsx
│   │   ├── JobCard.jsx              # Job card with Tailor modal trigger
│   │   ├── TailorModal.jsx          # In-card resume tailoring modal
│   │   └── StatCard.jsx
│   │
│   ├── hooks/
│   │   ├── useSpeechRecognition.js  # Web Speech API: silence detection, auto-submit
│   │   └── useSpeechSynthesis.js    # Browser TTS: sentence-by-sentence, fallback
│   │
│   ├── contexts/
│   │   └── ThemeContext.jsx         # Dark / light mode toggle
│   │
│   └── api/client.js                # Axios instance (baseURL: 4445, timeout: 3 min)
│
├── docker-compose.yml               # PostgreSQL only
├── start.sh                         # One command to start everything
├── .env.example                     # Copy to .env, fill in keys
├── RUNNING.txt                      # Full setup, troubleshooting, known issues
└── README.md
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `LLM_PROVIDER` | ✅ | `gemini` / `openai` / `anthropic` / `grok` |
| `GEMINI_API_KEY` | if gemini | Google AI Studio key |
| `OPENAI_API_KEY` | if openai | OpenAI key (also used for resume tailoring via GPT-4o) |
| `ANTHROPIC_API_KEY` | if anthropic | Anthropic key |
| `XAI_API_KEY` | if grok | xAI API key |
| `GMAIL_CLIENT_ID` | for Gmail sync | Google OAuth client ID |
| `GMAIL_CLIENT_SECRET` | for Gmail sync | Google OAuth client secret |
| `GMAIL_REDIRECT_URI` | for Gmail sync | `http://localhost:4445/auth/gmail/callback` |
| `RAPIDAPI_KEY` | optional | Enables JSearch (Indeed + LinkedIn aggregator) |
| `DATABASE_URL` | auto-set | `postgresql://jobcrm:jobcrm@localhost:5431/jobcrm` |
| `RUN_ON_STARTUP` | optional | `true` = trigger one job search 30s after server boot |
| `SMTP_HOST` | optional | SMTP server for digest emails |
| `SMTP_PORT` | optional | Default `587` |
| `SMTP_USER` | optional | SMTP username / from address |
| `SMTP_PASS` | optional | SMTP password |
| `DIGEST_EMAIL` | optional | Recipient address for daily digest |

**Resume tailoring methods:**

| Method | What you need |
|---|---|
| GPT-4o (LLM API) | `OPENAI_API_KEY` in `.env` |
| Claude Agent (Subscription) | Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`) and logged in with an active Claude Pro subscription |

---

## Pipeline flows

### Gmail sync

```
Sent folder scan
  └─► AI classifies each sent email (cold email / application / follow-up)
      └─► Upsert company record + set pipeline status

Thread-based inbox scan
  └─► For every known thread, fetch all incoming messages
      └─► AI classifies: interview invite / confirmation / reply / rejection

ATS inbox scan
  └─► Match known ATS domains (Greenhouse, Lever, Codility, HackerRank…)
      └─► Extract company from subject/body → classify

Ghosting detection  →  no reply in 21 days = status set to ghosted
Follow-up creation  →  no update in 7 days = follow-up reminder created
```

### Job search

```
Profile (role + skills + resume text)
  └─► LLM generates 5 diverse search queries
      └─► 10+ sources fetched in parallel (~30s)
          └─► Fuzzy dedup (SequenceMatcher ratio > 0.85 on company+title)
          └─► Dedup by URL + SHA-256(company+title)
          └─► Skip companies already in your pipeline
          └─► Hard reject filter (on-site, staffing, 7+ yrs, wrong stack)
          └─► Weighted SKILL_GROUPS filter (min score ≥ 4)
          └─► Save to DB
          └─► Auto-trigger AI scoring
              └─► LLM batch scorer (10 jobs/call, candidate-specific prompt)
                  └─► Results sorted by score on Job Search page
                  └─► Daily digest → backend/digests/YYYY-MM-DD.txt + email
```

### Resume tailoring

```
User pastes JD + company name
  └─► Chooses method: GPT-4o API or Claude Agent (CLI subprocess)
  └─► Optionally: extra instructions, generate cover letter checkbox
  └─► Backend builds prompt from hardcoded profile + resume text + JD
      └─► Returns JSON: tailored_summary, keywords_matched, skills,
                         experience (per company), projects, cover_letter
  └─► Frontend shows summary + keywords in result panel
  └─► Download buttons:
      └─► Resume .docx:
          ├─► If resume_base.docx template uploaded:
          │     Open template → replace ONLY summary paragraph + bullet
          │     points under each company → save → return bytes
          │     (fonts, layout, hyperlinks, all else untouched)
          └─► Fallback: build clean document from scratch
      └─► Cover Letter .docx (only if checkbox was checked):
          └─► Clean letter format with name + contact header
```

### Company pipeline

```
Cold Email Sent
  └─► Applied
      └─► Confirmation Received
          └─► Reply Received
              ├─► Interviewing ──► Offer
              ├─► Rejected
              └─► Ghosted (auto, 21 days silence)
```

---

## Weighted skill groups (job scoring)

| Group | Weight | Signals |
|---|---|---|
| kafka | 3 | kafka, event streaming, event-driven, kinesis, rabbitmq… |
| java_go | 3 | java, golang, jvm, kotlin… |
| spring_boot | 2 | spring boot, spring framework… |
| api_platform | 2 | api gateway, api management, grpc, openapi… |
| distributed | 2 | microservices, distributed systems, high throughput… |
| data_infra | 2 | data pipeline, streaming, real-time, etl… |
| cloud | 1 | aws, gcp, azure, kubernetes, docker… |
| postgres_redis | 1 | postgresql, redis, mongodb… |
| fintech | 1 | fintech, payments, banking… |
| remote_signal | 1 | remote, remote-first, distributed team… |

---

## Adding companies to ATS search

`backend/services/job_boards_ats.py` has slug lists grouped by role (`UNIVERSAL_SLUGS`, `BACKEND_SLUGS`, `FRONTEND_SLUGS`, `AI_ML_SLUGS`, `DEVOPS_SLUGS`, `DATA_SLUGS`). The search selects relevant categories automatically based on your profile — no manual picking needed.

To add a company, find its slug from the job board URL:
- Greenhouse: `boards.greenhouse.io/<slug>/jobs`
- Lever: `jobs.lever.co/<slug>`
- Ashby: `jobs.ashbyhq.com/<slug>`

Add the slug to the appropriate list in `job_boards_ats.py`.

---

## What this is not

This does not apply to jobs for you. It does not send emails without your review. It does not share your data with anyone. It is a personal CRM, a job tracker, a research tool, a resume writer, and an interview coach. You stay in control of every action that matters.
