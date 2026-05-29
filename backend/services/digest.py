"""
Daily job digest — runs after each search pipeline.

Sends a plain-text email via SMTP and writes to backend/digests/{date}.txt.
Only fires when there are jobs scored >= 7 (stored as >= 70 in match_score).
"""

import os
import logging
import smtplib
from datetime import date
from email.mime.text import MIMEText
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

DIGEST_MIN_SCORE = 70   # match_score >= 70 (= 7/10 from LLM)


async def send_digest(job_ids: List[int]) -> None:
    """Generate and send the digest for the given job IDs."""
    if not job_ids:
        logger.info("Digest: no jobs — skipping")
        return

    from database import SessionLocal
    from models import Job

    db = SessionLocal()
    try:
        jobs = (
            db.query(Job)
            .filter(
                Job.id.in_(job_ids),
                Job.match_score >= DIGEST_MIN_SCORE,
            )
            .order_by(Job.match_score.desc())
            .all()
        )
    finally:
        db.close()

    if not jobs:
        logger.info("Digest: no jobs above score threshold — skipping")
        return

    today    = date.today().isoformat()
    count    = len(jobs)
    top_jobs = jobs[:15]

    lines = [
        f"JobCRM Daily Digest — {today}",
        f"{count} strong match{'es' if count != 1 else ''} found today.",
        "",
        "TOP MATCHES:",
        "",
    ]

    for j in top_jobs:
        score_display = f"{j.match_score // 10}/10" if j.match_score else "?"
        reasons = j.match_reasons or []
        reason_str = reasons[0] if reasons else ""
        lines += [
            f"[{score_display}] {j.company_name} — {j.title}",
            f"  {j.source_url}",
        ]
        if reason_str:
            lines.append(f"  Why: {reason_str}")
        if j.salary_range:
            lines.append(f"  Salary: {j.salary_range}")
        lines.append("---")

    digest_text = "\n".join(lines)

    # Write to disk
    digest_dir = Path(__file__).parent.parent / "digests"
    digest_dir.mkdir(exist_ok=True)
    digest_file = digest_dir / f"{today}.txt"
    try:
        digest_file.write_text(digest_text, encoding="utf-8")
        logger.info(f"Digest written to {digest_file}")
    except Exception as e:
        logger.warning(f"Digest file write failed: {e}")

    # Send email
    smtp_host  = os.getenv("SMTP_HOST", "")
    smtp_port  = int(os.getenv("SMTP_PORT", "587"))
    smtp_user  = os.getenv("SMTP_USER", "")
    smtp_pass  = os.getenv("SMTP_PASS", "")
    to_email   = os.getenv("DIGEST_EMAIL", "")

    if not all([smtp_host, smtp_user, smtp_pass, to_email]):
        logger.info("Digest: SMTP not configured — skipping email (digest saved to disk)")
        return

    try:
        msg            = MIMEText(digest_text, "plain", "utf-8")
        msg["Subject"] = f"JobCRM: {count} strong match{'es' if count != 1 else ''} — {today}"
        msg["From"]    = smtp_user
        msg["To"]      = to_email

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [to_email], msg.as_string())

        logger.info(f"Digest email sent to {to_email} ({count} jobs)")
    except Exception as e:
        logger.error(f"Digest email failed: {e}")
