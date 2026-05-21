import enum
import hashlib
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, Float,
    ForeignKey, Enum as SAEnum, JSON, ARRAY, UniqueConstraint
)
from sqlalchemy.orm import relationship
from database import Base


class CompanyStatus(str, enum.Enum):
    cold_email_sent = "cold_email_sent"
    applied = "applied"
    confirmation_received = "confirmation_received"
    reply_received = "reply_received"
    interviewing = "interviewing"
    offer = "offer"
    rejected = "rejected"
    ghosted = "ghosted"


class CompanySource(str, enum.Enum):
    cold_email = "cold_email"
    job_board = "job_board"
    referral = "referral"
    manual = "manual"


class EmailType(str, enum.Enum):
    cold_sent = "cold_sent"
    application_confirm = "application_confirm"
    interview_invite = "interview_invite"
    reply = "reply"
    rejection = "rejection"
    follow_up_sent = "follow_up_sent"
    other = "other"


class JobStatus(str, enum.Enum):
    new = "new"
    saved = "saved"
    applied = "applied"
    dismissed = "dismissed"


class SyncType(str, enum.Enum):
    gmail = "gmail"
    job_search = "job_search"


class SyncStatus(str, enum.Enum):
    success = "success"
    failed = "failed"


STATUS_RANK = {
    "cold_email_sent": 1,
    "applied": 2,
    "confirmation_received": 3,
    "reply_received": 4,
    "interviewing": 5,
    "offer": 6,
    "rejected": 7,
    "ghosted": 2,
}


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    skills = Column(ARRAY(Text), default=[])
    experience_years = Column(Integer, default=0)
    preferences = Column(JSON, default={})
    resume_text = Column(Text)
    resume_raw = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    website = Column(String)
    linkedin_url = Column(String)
    status = Column(SAEnum(CompanyStatus), default=CompanyStatus.cold_email_sent)
    source = Column(SAEnum(CompanySource), default=CompanySource.manual)
    notes = Column(Text)
    added_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    emails = relationship("Email", back_populates="company")
    follow_ups = relationship("FollowUp", back_populates="company")


class Email(Base):
    __tablename__ = "emails"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    gmail_message_id = Column(String, unique=True, nullable=False)
    thread_id = Column(String)
    type = Column(SAEnum(EmailType), default=EmailType.other)
    subject = Column(String)
    snippet = Column(Text)
    sender = Column(String)
    recipient = Column(String)
    received_at = Column(DateTime)
    synced_at = Column(DateTime, default=datetime.utcnow)

    company = relationship("Company", back_populates="emails")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    company_name = Column(String, nullable=False)
    company_website = Column(String)
    description = Column(Text)
    location = Column(String)
    salary_range = Column(String)
    job_type = Column(String)
    source = Column(String)
    source_url = Column(String, unique=True)
    match_score = Column(Integer, default=0)
    match_reasons = Column(JSON, default=[])
    tags = Column(ARRAY(Text), default=[])
    status = Column(SAEnum(JobStatus), default=JobStatus.new)
    fetched_at = Column(DateTime, default=datetime.utcnow)
    applied_at = Column(DateTime)

    @staticmethod
    def dedup_key(company_name: str, title: str) -> str:
        raw = f"{company_name.lower().strip()}{title.lower().strip()}"
        return hashlib.sha256(raw.encode()).hexdigest()


class FollowUp(Base):
    __tablename__ = "follow_ups"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    due_date = Column(DateTime, nullable=False)
    note = Column(Text)
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    company = relationship("Company", back_populates="follow_ups")


class SyncLog(Base):
    __tablename__ = "sync_logs"

    id = Column(Integer, primary_key=True, index=True)
    sync_type = Column(SAEnum(SyncType), nullable=False)
    status = Column(SAEnum(SyncStatus))
    emails_processed = Column(Integer, default=0)
    jobs_fetched = Column(Integer, default=0)
    error_message = Column(Text)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id = Column(Integer, primary_key=True, index=True)
    mode = Column(String)  # "job", "concept", "both"
    jd_text = Column(Text, nullable=True)
    concept = Column(String, nullable=True)
    job_id = Column(Integer, nullable=True)  # reference to jobs table, no FK constraint
    conversation = Column(JSON, default=list)  # [{role, content, timestamp}]
    debrief = Column(Text, nullable=True)
    status = Column(String, default="active")  # active, completed
    question_count = Column(Integer, default=0)
    total_questions = Column(Integer, default=10)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
