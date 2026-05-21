import os
import asyncio
import logging
from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger(__name__)

_scheduler = BackgroundScheduler()


def _run_daily_sync():
    async def _async_sync():
        from agents.gmail_agent import run_gmail_sync
        from agents.job_search_agent import run_job_search
        try:
            await asyncio.gather(
                run_gmail_sync(),
                run_job_search(),
                return_exceptions=True,
            )
        except Exception as e:
            logger.error(f"Daily sync error: {e}")

    asyncio.run(_async_sync())


def start_scheduler():
    sync_hour = int(os.getenv("SYNC_HOUR", "21"))
    sync_minute = int(os.getenv("SYNC_MINUTE", "30"))

    _scheduler.add_job(
        _run_daily_sync,
        trigger="cron",
        hour=sync_hour,
        minute=sync_minute,
        id="daily_sync",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(f"Scheduler started. Daily sync at {sync_hour:02d}:{sync_minute:02d}.")


def stop_scheduler():
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
