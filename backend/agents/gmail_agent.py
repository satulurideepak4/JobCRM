import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Company, Email, SyncLog, CompanyStatus, CompanySource, EmailType, SyncType, SyncStatus, STATUS_RANK
import llm_service

logger = logging.getLogger(__name__)

_sync_running = False
_sync_started_at: Optional[datetime] = None
_sync_progress = "idle"


def get_sync_status():
    return {
        "running": _sync_running,
        "started_at": _sync_started_at.isoformat() if _sync_started_at else None,
        "progress": _sync_progress,
    }


def reset_sync_flag():
    global _sync_running, _sync_progress
    _sync_running = False
    _sync_progress = "idle (manually reset)"


def _get_last_sync():
    db = SessionLocal()
    try:
        log = (
            db.query(SyncLog)
            .filter(SyncLog.sync_type == SyncType.gmail, SyncLog.status == SyncStatus.success)
            .order_by(SyncLog.completed_at.desc())
            .first()
        )
        return log
    finally:
        db.close()


def _upsert_company(db: Session, name: str, source: CompanySource, status: CompanyStatus) -> Company:
    company = db.query(Company).filter(Company.name.ilike(name)).first()
    if not company:
        company = Company(name=name, source=source, status=status)
        db.add(company)
        db.commit()
        db.refresh(company)
    else:
        current_rank = STATUS_RANK.get(company.status.value, 0)
        new_rank = STATUS_RANK.get(status.value, 0)
        if new_rank > current_rank:
            company.status = status
            company.updated_at = datetime.utcnow()
            db.commit()
    return company


def _safe_update_status(db: Session, company: Company, new_status: CompanyStatus):
    current_rank = STATUS_RANK.get(company.status.value, 0)
    new_rank = STATUS_RANK.get(new_status.value, 0)
    if new_rank > current_rank:
        company.status = new_status
        company.updated_at = datetime.utcnow()
        db.commit()


async def run_gmail_sync():
    global _sync_running, _sync_started_at, _sync_progress

    if _sync_running:
        logger.info("Gmail sync already running, skipping.")
        return

    _sync_running = True
    _sync_started_at = datetime.utcnow()
    _sync_progress = "starting"

    db = SessionLocal()
    log = SyncLog(sync_type=SyncType.gmail, started_at=datetime.utcnow())
    db.add(log)
    db.commit()

    emails_processed = 0

    try:
        # Check profile exists
        from models import Profile
        profile = db.query(Profile).first()
        if not profile:
            raise ValueError("No profile found. Please set up your profile first.")

        from services.gmail_service import fetch_emails, is_connected
        if not is_connected():
            raise ValueError("Gmail not connected. Please complete OAuth first.")

        # Only scan emails since the last successful sync (with 1-day overlap).
        # First-ever sync scans 60 days back.
        last_ok = _get_last_sync()
        if last_ok and last_ok.completed_at:
            days_back = max((datetime.utcnow() - last_ok.completed_at).days + 1, 7)
        else:
            days_back = 60

        _sync_progress = "scanning sent folder"
        sent_emails = fetch_emails(["SENT"], after_days=days_back, max_results=500)

        for email_data in sent_emails:
            gmail_id = email_data["id"]
            if db.query(Email).filter(Email.gmail_message_id == gmail_id).first():
                continue

            subject = email_data.get("subject", "")
            snippet = email_data.get("snippet", "")

            prompt = f"""Given this email subject and snippet, is this a cold email to a company for a job or internship opportunity, or a job application confirmation?
Reply only in JSON: {{"is_job_related": <bool>, "type": "cold_sent|application_confirm|follow_up_sent|other", "company_name": <str or null>, "role": <str or null>, "confidence": <float>}}

Subject: {subject}
Snippet: {snippet}"""

            try:
                result = await llm_service.generate(prompt)
                if not isinstance(result, dict):
                    continue

                if not result.get("is_job_related") or result.get("confidence", 0) <= 0.7:
                    continue

                company_name = result.get("company_name")
                if not company_name:
                    continue

                email_type_str = result.get("type", "other")
                try:
                    email_type = EmailType(email_type_str)
                except ValueError:
                    email_type = EmailType.other

                if email_type in (EmailType.cold_sent, EmailType.follow_up_sent):
                    company_status = CompanyStatus.cold_email_sent
                    company_source = CompanySource.cold_email
                elif email_type == EmailType.application_confirm:
                    company_status = CompanyStatus.applied
                    company_source = CompanySource.job_board
                else:
                    continue

                company = _upsert_company(db, company_name, company_source, company_status)

                email_record = Email(
                    company_id=company.id,
                    gmail_message_id=gmail_id,
                    thread_id=email_data.get("thread_id", ""),
                    type=email_type,
                    subject=subject,
                    snippet=snippet,
                    sender=email_data.get("sender", ""),
                    recipient=email_data.get("recipient", ""),
                    received_at=email_data.get("received_at"),
                )
                db.add(email_record)
                db.commit()
                emails_processed += 1

            except Exception as e:
                logger.warning(f"Error processing sent email {gmail_id}: {e}")

        # ── INBOX PHASE 1: Thread-based matching ──────────────────────────────
        # For every thread we already have a sent email in, fetch the full
        # thread and process any incoming messages we haven't seen yet.
        # This catches ALL replies regardless of sender domain (ATS, Greenhouse, etc.)
        _sync_progress = "scanning reply threads"

        from services.gmail_service import fetch_thread_messages, fetch_message_body, is_ats_sender
        from services.gmail_service import get_gmail_user_email
        my_email = (get_gmail_user_email() or "").lower()

        # Map thread_id → company for every thread we know about
        known_thread_rows = (
            db.query(Email.thread_id, Email.company_id)
            .filter(Email.thread_id.isnot(None))
            .distinct()
            .all()
        )
        thread_company_map = {row.thread_id: row.company_id for row in known_thread_rows}

        for thread_id, company_id in thread_company_map.items():
            try:
                thread_msgs = fetch_thread_messages(thread_id)
            except Exception as e:
                logger.warning(f"Could not fetch thread {thread_id}: {e}")
                continue

            company = db.query(Company).filter(Company.id == company_id).first()
            if not company:
                continue

            for msg in thread_msgs:
                gmail_id = msg["id"]

                # Skip messages we already processed
                if db.query(Email).filter(Email.gmail_message_id == gmail_id).first():
                    continue

                sender = msg.get("sender", "")

                # Skip our own sent messages — we only want incoming
                if my_email and my_email in sender.lower():
                    continue

                subject = msg.get("subject", "")

                # Fetch full body for accurate classification
                try:
                    body = fetch_message_body(gmail_id)
                    body_excerpt = body[:1000] if body else msg.get("snippet", "")
                except Exception:
                    body_excerpt = msg.get("snippet", "")

                prompt = f"""You are classifying an incoming email in a job application context.
The candidate applied to: {company.name}

Email types:
- interview_invite: scheduling an interview, sending a take-home test / coding challenge / assessment link, asking for availability
- application_confirm: automated acknowledgement that application was received
- reply: any other human reply (questions, interest, follow-up info request)
- rejection: rejected / position filled / no longer moving forward
- other: newsletter, unrelated, spam

Reply ONLY in JSON: {{"type": "interview_invite|application_confirm|reply|rejection|other", "sentiment": "positive|neutral|negative", "key_info": "<one line summary>"}}

Subject: {subject}
From: {sender}
Body excerpt:
{body_excerpt}"""

                try:
                    result = await llm_service.generate(prompt)
                    if not isinstance(result, dict):
                        continue

                    email_type_str = result.get("type", "other")
                    sentiment = result.get("sentiment", "neutral")

                    try:
                        email_type = EmailType(email_type_str)
                    except ValueError:
                        email_type = EmailType.other

                    if email_type_str == "interview_invite":
                        _safe_update_status(db, company, CompanyStatus.interviewing)
                    elif email_type == EmailType.application_confirm:
                        _safe_update_status(db, company, CompanyStatus.confirmation_received)
                    elif email_type == EmailType.reply and sentiment in ("positive", "neutral"):
                        _safe_update_status(db, company, CompanyStatus.reply_received)
                    elif email_type == EmailType.rejection:
                        _safe_update_status(db, company, CompanyStatus.rejected)

                    email_record = Email(
                        company_id=company.id,
                        gmail_message_id=gmail_id,
                        thread_id=thread_id,
                        type=email_type,
                        subject=subject,
                        snippet=body_excerpt[:500],
                        sender=sender,
                        recipient=msg.get("recipient", ""),
                        received_at=msg.get("received_at"),
                    )
                    db.add(email_record)
                    db.commit()
                    emails_processed += 1

                except Exception as e:
                    logger.warning(f"Error classifying thread message {gmail_id}: {e}")

        # ── INBOX PHASE 2: ATS / job board domain scan ────────────────────────
        # Scan inbox for emails from known ATS platforms that are NOT in any
        # existing thread. Extract company name from subject via LLM.
        _sync_progress = "scanning ATS inbox emails"
        inbox_emails = fetch_emails(["INBOX"], after_days=days_back, max_results=500)

        # Build set of thread_ids we already handled in Phase 1
        handled_threads = set(thread_company_map.keys())
        # Build company name map for fuzzy matching
        companies = db.query(Company).all()
        company_name_map = {c.name.lower(): c for c in companies}

        for email_data in inbox_emails:
            gmail_id = email_data["id"]
            if db.query(Email).filter(Email.gmail_message_id == gmail_id).first():
                continue

            email_thread_id = email_data.get("thread_id", "")
            if email_thread_id in handled_threads:
                continue  # already processed in Phase 1

            sender = email_data.get("sender", "")

            # Only process ATS senders OR senders whose domain matches a known company
            sender_domain = sender.split("@")[-1].strip(">").lower() if "@" in sender else ""
            is_ats = is_ats_sender(sender)

            # Try direct company name match in sender
            matched_company = None
            for cname, company in company_name_map.items():
                if cname in sender.lower() or (sender_domain and cname.replace(" ", "") in sender_domain):
                    matched_company = company
                    break

            if not matched_company and not is_ats:
                continue  # unknown sender, skip

            subject = email_data.get("subject", "")

            # Fetch full body
            try:
                body = fetch_message_body(gmail_id)
                body_excerpt = body[:1000] if body else email_data.get("snippet", "")
            except Exception:
                body_excerpt = email_data.get("snippet", "")

            if is_ats and not matched_company:
                # Ask LLM to identify company from subject/body
                extract_prompt = f"""This email is from a job application platform ({sender_domain}).
Extract the company name the candidate applied to.
Reply ONLY in JSON: {{"company_name": <str or null>}}

Subject: {subject}
Body: {body_excerpt[:300]}"""
                try:
                    extract_result = await llm_service.generate(extract_prompt)
                    extracted_name = extract_result.get("company_name") if isinstance(extract_result, dict) else None
                    if extracted_name:
                        for cname, company in company_name_map.items():
                            if cname in extracted_name.lower() or extracted_name.lower() in cname:
                                matched_company = company
                                break
                except Exception:
                    pass

            if not matched_company:
                continue

            prompt = f"""Classify this incoming email in a job application context.
The candidate applied to: {matched_company.name}

Email types:
- interview_invite: interview scheduling, take-home test, coding challenge/assessment link, availability request
- application_confirm: automated receipt of application
- reply: human reply not interview-related
- rejection: rejected / no longer moving forward
- other: unrelated

Reply ONLY in JSON: {{"type": "interview_invite|application_confirm|reply|rejection|other", "sentiment": "positive|neutral|negative", "key_info": "<one line summary>"}}

Subject: {subject}
From: {sender}
Body excerpt:
{body_excerpt}"""

            try:
                result = await llm_service.generate(prompt)
                if not isinstance(result, dict):
                    continue

                email_type_str = result.get("type", "other")
                sentiment = result.get("sentiment", "neutral")

                try:
                    email_type = EmailType(email_type_str)
                except ValueError:
                    email_type = EmailType.other

                if email_type_str == "interview_invite":
                    _safe_update_status(db, matched_company, CompanyStatus.interviewing)
                elif email_type == EmailType.application_confirm:
                    _safe_update_status(db, matched_company, CompanyStatus.confirmation_received)
                elif email_type == EmailType.reply and sentiment in ("positive", "neutral"):
                    _safe_update_status(db, matched_company, CompanyStatus.reply_received)
                elif email_type == EmailType.rejection:
                    _safe_update_status(db, matched_company, CompanyStatus.rejected)

                email_record = Email(
                    company_id=matched_company.id,
                    gmail_message_id=gmail_id,
                    thread_id=email_thread_id,
                    type=email_type,
                    subject=subject,
                    snippet=body_excerpt[:500],
                    sender=sender,
                    recipient=email_data.get("recipient", ""),
                    received_at=email_data.get("received_at"),
                )
                db.add(email_record)
                db.commit()
                emails_processed += 1
                handled_threads.add(email_thread_id)

            except Exception as e:
                logger.warning(f"Error processing ATS inbox email {gmail_id}: {e}")

        _sync_progress = "detecting ghosting"
        ghost_cutoff = datetime.utcnow() - timedelta(days=21)
        stale_companies = (
            db.query(Company)
            .filter(
                Company.status.in_([CompanyStatus.cold_email_sent, CompanyStatus.applied]),
                Company.updated_at < ghost_cutoff,
            )
            .all()
        )
        for company in stale_companies:
            company.status = CompanyStatus.ghosted
            company.updated_at = datetime.utcnow()
        db.commit()

        # Create follow-up reminders for companies with no update in 7 days
        _sync_progress = "creating follow-ups"
        from models import FollowUp
        followup_cutoff = datetime.utcnow() - timedelta(days=7)
        follow_up_candidates = (
            db.query(Company)
            .filter(
                Company.status.in_([CompanyStatus.cold_email_sent, CompanyStatus.applied]),
                Company.updated_at < followup_cutoff,
            )
            .all()
        )
        for company in follow_up_candidates:
            existing = (
                db.query(FollowUp)
                .filter(FollowUp.company_id == company.id, FollowUp.completed == False)
                .first()
            )
            if not existing:
                fu = FollowUp(
                    company_id=company.id,
                    due_date=datetime.utcnow(),
                    note=f"Follow up with {company.name} — no response in 7+ days",
                )
                db.add(fu)
        db.commit()

        log.status = SyncStatus.success
        log.emails_processed = emails_processed
        log.completed_at = datetime.utcnow()
        db.commit()
        _sync_progress = "completed"

    except Exception as e:
        logger.error(f"Gmail sync failed: {e}")
        log.status = SyncStatus.failed
        log.error_message = str(e)
        log.completed_at = datetime.utcnow()
        db.commit()
        _sync_progress = f"failed: {e}"
    finally:
        db.close()
        _sync_running = False
