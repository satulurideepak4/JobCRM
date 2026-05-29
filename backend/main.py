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

    # Lightweight column migrations — safe to run on every startup (uses IF NOT EXISTS)
    try:
        from database import engine
        with engine.connect() as conn:
            for col_sql in [
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resume_filename VARCHAR",
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resume_file_path VARCHAR",
            ]:
                conn.execute(__import__('sqlalchemy').text(col_sql))
            conn.commit()
    except Exception as e:
        print(f"Column migration warning: {e}")

    # Ensure uploads directory exists
    os.makedirs("uploads", exist_ok=True)

    # Start scheduler
    from scheduler import start_scheduler, stop_scheduler
    start_scheduler()

    yield

    stop_scheduler()


app = FastAPI(title="JobCRM API", version="1.0.0", lifespan=lifespan)

@app.middleware("http")
async def no_cache_middleware(request: Request, call_next):
    # Strip conditional request headers so 304s are never triggered
    request.scope["headers"] = [
        (k, v) for k, v in request.scope.get("headers", [])
        if k.lower() not in (b"if-none-match", b"if-modified-since", b"if-match", b"if-unmodified-since")
    ]
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4444",
        "http://localhost:4445",
        "http://localhost:4446",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:4444",
        "http://127.0.0.1:5173",
    ],
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
