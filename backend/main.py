import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from dotenv import load_dotenv

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run Alembic migrations on startup
    from alembic.config import Config
    from alembic import command
    import subprocess
    import sys

    try:
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
        print("Database migrations applied.")
    except Exception as e:
        print(f"Alembic migration warning: {e} — falling back to create_all")
        try:
            from database import engine, Base
            import models  # noqa: F401
            Base.metadata.create_all(bind=engine)
            print("Tables created via create_all.")
        except Exception as e2:
            print(f"create_all also failed: {e2}")

    # Start scheduler
    from scheduler import start_scheduler, stop_scheduler
    start_scheduler()

    yield

    stop_scheduler()


app = FastAPI(title="JobCRM API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4444"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"data": None, "error": str(exc), "status": 500},
    )


# Register routers
from routes.profile import router as profile_router
from routes.applications import router as applications_router
from routes.jobs import router as jobs_router
from routes.emails import router as emails_router
from routes.followups import router as followups_router
from routes.dashboard import router as dashboard_router
from routes.gmail import router as gmail_router
from routes.interview import router as interview_router

app.include_router(profile_router, prefix="/api")
app.include_router(applications_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
app.include_router(emails_router, prefix="/api")
app.include_router(followups_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(gmail_router)
app.include_router(interview_router)


@app.get("/health")
async def health():
    return {"data": {"status": "ok"}, "error": None, "status": 200}
