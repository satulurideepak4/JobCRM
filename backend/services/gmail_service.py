import os
import json
import base64
from datetime import datetime, timezone
from typing import Optional, List, Dict
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from dotenv import load_dotenv

load_dotenv()

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
TOKEN_FILE = "gmail_token.json"

CLIENT_ID = os.getenv("GMAIL_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("GMAIL_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("GMAIL_REDIRECT_URI", "http://localhost:8000/auth/gmail/callback")

# Held between get_auth_url() and exchange_code() so PKCE code_verifier is preserved
_pending_flow: Optional[Flow] = None


def _client_config():
    return {
        "web": {
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "redirect_uris": [REDIRECT_URI],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }


def get_auth_url() -> str:
    global _pending_flow
    _pending_flow = Flow.from_client_config(_client_config(), scopes=SCOPES)
    _pending_flow.redirect_uri = REDIRECT_URI
    auth_url, _ = _pending_flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url


def exchange_code(code: str) -> Credentials:
    global _pending_flow
    if _pending_flow is None:
        raise RuntimeError("No pending OAuth flow. Please click 'Connect Gmail' again.")
    _pending_flow.fetch_token(code=code)
    creds = _pending_flow.credentials
    _pending_flow = None
    _save_token(creds)
    return creds


def _save_token(creds: Credentials):
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes) if creds.scopes else SCOPES,
    }
    with open(TOKEN_FILE, "w") as f:
        json.dump(token_data, f)


def load_credentials() -> Optional[Credentials]:
    if not os.path.exists(TOKEN_FILE):
        return None
    with open(TOKEN_FILE) as f:
        data = json.load(f)
    creds = Credentials(
        token=data.get("token"),
        refresh_token=data.get("refresh_token"),
        token_uri=data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=data.get("client_id", CLIENT_ID),
        client_secret=data.get("client_secret", CLIENT_SECRET),
        scopes=data.get("scopes", SCOPES),
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        _save_token(creds)
    return creds


def is_connected() -> bool:
    try:
        creds = load_credentials()
        return creds is not None and creds.valid
    except Exception:
        return False


def get_gmail_user_email() -> Optional[str]:
    try:
        creds = load_credentials()
        if not creds:
            return None
        service = build("gmail", "v1", credentials=creds)
        profile = service.users().getProfile(userId="me").execute()
        return profile.get("emailAddress")
    except Exception:
        return None


def get_gmail_service():
    creds = load_credentials()
    if not creds:
        raise RuntimeError("Gmail not connected. Please complete OAuth first.")
    return build("gmail", "v1", credentials=creds)


# Known ATS / hiring platform domains → we extract company from subject/body instead of sender domain
ATS_DOMAINS = {
    # ATS platforms
    "greenhouse.io", "lever.co", "ashbyhq.com", "workday.com", "taleo.net",
    "smartrecruiters.com", "jobvite.com", "icims.com", "bamboohr.com",
    "successfactors.com", "oraclecloud.com", "myworkdayjobs.com",
    "recsolu.com", "bullhornstaffing.com", "jazz.co", "recruitee.com",
    "breezy.hr", "pinpointhq.com", "dover.com", "rippling.com",
    # Assessment / interview platforms
    "hackerrank.com", "codility.com", "testgorilla.com", "hirevue.com",
    "karat.com", "codesignal.com", "coderbyte.com", "hackerearth.com",
    "mettl.com", "qualified.io", "vervoe.com", "interviewing.io",
    # Job boards that send on behalf of companies
    "linkedin.com", "indeed.com", "glassdoor.com", "wellfound.com",
    "ycombinator.com", "remotive.com", "weworkremotely.com",
}


def is_ats_sender(sender: str) -> bool:
    """Return True if this email came from a known ATS or hiring platform."""
    if "@" not in sender:
        return False
    domain = sender.split("@")[-1].strip(">").lower()
    return any(ats in domain for ats in ATS_DOMAINS)


def _decode_body(payload: dict) -> str:
    """Extract plain text body from email payload."""
    if payload.get("mimeType") == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
    for part in payload.get("parts", []):
        result = _decode_body(part)
        if result:
            return result
    return ""


def fetch_message_body(message_id: str) -> str:
    """Fetch the full plain-text body of a single message."""
    service = get_gmail_service()
    msg = service.users().messages().get(
        userId="me", id=message_id, format="full"
    ).execute()
    return _decode_body(msg.get("payload", {}))


def fetch_thread_messages(thread_id: str) -> List[Dict]:
    """
    Fetch all messages in a thread with metadata headers.
    Returns list of dicts with id, subject, sender, date, snippet, thread_id.
    """
    service = get_gmail_service()
    thread = service.users().threads().get(
        userId="me",
        id=thread_id,
        format="metadata",
        metadataHeaders=["Subject", "From", "To", "Date"],
    ).execute()

    results = []
    for msg in thread.get("messages", []):
        headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        date_str = headers.get("Date", "")
        try:
            from email.utils import parsedate_to_datetime
            received_at = parsedate_to_datetime(date_str).replace(tzinfo=None)
        except Exception:
            received_at = datetime.utcnow()

        results.append({
            "id": msg["id"],
            "thread_id": thread_id,
            "subject": headers.get("Subject", ""),
            "sender": headers.get("From", ""),
            "recipient": headers.get("To", ""),
            "snippet": msg.get("snippet", ""),
            "received_at": received_at,
            "label_ids": msg.get("labelIds", []),
        })
    return results


def fetch_emails(label_ids: List[str], after_days: int = 60, max_results: int = 200) -> List[Dict]:
    """Fetch emails from Gmail with given labels, returns list of message dicts."""
    service = get_gmail_service()
    from datetime import timedelta
    after_date = datetime.now() - timedelta(days=after_days)
    after_ts = int(after_date.timestamp())
    query = f"after:{after_ts}"

    results = []
    page_token = None

    while len(results) < max_results:
        kwargs = {
            "userId": "me",
            "labelIds": label_ids,
            "q": query,
            "maxResults": min(50, max_results - len(results)),
        }
        if page_token:
            kwargs["pageToken"] = page_token

        response = service.users().messages().list(**kwargs).execute()
        messages = response.get("messages", [])

        for msg_ref in messages:
            msg = service.users().messages().get(
                userId="me",
                id=msg_ref["id"],
                format="metadata",
                metadataHeaders=["Subject", "From", "To", "Date"],
            ).execute()

            headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}

            date_str = headers.get("Date", "")
            try:
                from email.utils import parsedate_to_datetime
                received_at = parsedate_to_datetime(date_str).replace(tzinfo=None)
            except Exception:
                received_at = datetime.utcnow()

            results.append({
                "id": msg["id"],
                "thread_id": msg.get("threadId", ""),
                "subject": headers.get("Subject", "(no subject)"),
                "snippet": msg.get("snippet", ""),
                "sender": headers.get("From", ""),
                "recipient": headers.get("To", ""),
                "received_at": received_at,
                "label_ids": msg.get("labelIds", []),
            })

        page_token = response.get("nextPageToken")
        if not page_token or not messages:
            break

    results.sort(key=lambda x: x["received_at"])
    return results
