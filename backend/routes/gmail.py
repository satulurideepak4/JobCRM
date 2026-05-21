from fastapi import APIRouter
from fastapi.responses import RedirectResponse
import asyncio

router = APIRouter(tags=["gmail"])


@router.get("/auth/gmail")
async def start_gmail_oauth():
    from services.gmail_service import get_auth_url
    url = get_auth_url()
    return RedirectResponse(url=url)


@router.get("/auth/gmail/callback")
async def gmail_callback(code: str = None, error: str = None):
    if error or not code:
        reason = error or "no_code"
        return RedirectResponse(url=f"http://localhost:4444/profile?gmail=error&msg={reason}")
    from services.gmail_service import exchange_code
    try:
        exchange_code(code)
        return RedirectResponse(url="http://localhost:4444/profile?gmail=connected")
    except Exception as e:
        return RedirectResponse(url=f"http://localhost:4444/profile?gmail=error&msg={str(e)}")


@router.get("/api/gmail/auth/status")
async def gmail_auth_status():
    from services.gmail_service import is_connected, get_gmail_user_email
    connected = is_connected()
    email = get_gmail_user_email() if connected else None
    return {"data": {"connected": connected, "email": email}, "error": None, "status": 200}


@router.post("/api/gmail/sync")
async def trigger_gmail_sync(force: bool = False):
    from agents.gmail_agent import run_gmail_sync, get_sync_status, reset_sync_flag
    status = get_sync_status()
    if status["running"] and not force:
        return {"data": {"message": "Sync already running"}, "error": None, "status": 200}
    if force:
        reset_sync_flag()
    asyncio.create_task(run_gmail_sync())
    return {"data": {"message": "Gmail sync started"}, "error": None, "status": 200}


@router.get("/api/gmail/sync/status")
async def gmail_sync_status():
    from agents.gmail_agent import get_sync_status
    from database import SessionLocal
    from models import SyncLog, SyncType, SyncStatus

    db = SessionLocal()
    try:
        last = (
            db.query(SyncLog)
            .filter(SyncLog.sync_type == SyncType.gmail)
            .order_by(SyncLog.completed_at.desc())
            .first()
        )
        status = get_sync_status()
        return {
            "data": {
                **status,
                "last_sync_at": last.completed_at.isoformat() if last and last.completed_at else None,
                "last_sync_result": last.status.value if last and last.status else None,
            },
            "error": None,
            "status": 200,
        }
    finally:
        db.close()
