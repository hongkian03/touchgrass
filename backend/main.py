"""PromptPrint backend (F6): user actions and capture failures trigger the Droid jobs.

Routes:
  POST /upload                 chat export (multipart) -> {job_id}; runs ingest then analyze
  GET  /jobs/{job_id}          status and summary
  GET  /jobs/{job_id}/audit    Daytona mode: the job's sandbox and every file in and out (names, sizes)
  GET  /jobs/{job_id}/logs     Server-Sent Events: the job's Droid log lines as they're written
  GET  /insights/latest        the latest successful analysis's insights.json
  POST /adapter-failure        {site, failed_keys, adapter_version, snapshot_html, ...} -> {job_id}
  GET  /space/insight          night-lights growth over 3 data center regions (NASA GIBS, cached in
                               space/cache/) and an estimated "your_share" from the latest insights

Mode (logged at startup; see executor.active_mode): Daytona when DAYTONA_API_KEY is set, local when
it isn't, replay when DEMO_REPLAY=1; EXECUTOR=local|daytona overrides. One Droid job runs at a time
in local mode, up to 3 in Daytona mode (one sandbox each); the rest wait as "queued". Jobs run in a
worker thread so requests keep being served while Droid works. In Daytona mode /upload reads the
body into memory itself (multipart or raw with ?filename=, 50 MB cap), since UploadFile spools large
files to disk. Run: py start.py (or py -m uvicorn backend.main:app)
"""

import asyncio
import email.policy
import json
import logging
from email.parser import BytesParser
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.datastructures import UploadFile as StarletteUploadFile

# Keys and mode settings, before the executor reads the environment. Values already set win.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from backend.executor import REPO, active_mode, get_executor, sandbox_mode  # noqa: E402
from backend.jobs import DONE, JobStore  # noqa: E402
from space import nasa_lights  # noqa: E402

ADAPTERS_DIR = REPO / "backend" / "adapters"
LOG_POLL_SECONDS = 0.5

app = FastAPI(title="PromptPrint")
store = JobStore()
MODE, MODE_REASON = active_mode()
executor = get_executor()
# Also true with DEMO_REPLAY=1, so a replayed Daytona demo still takes uploads in memory.
DAYTONA = sandbox_mode()[0] == "daytona"
logging.getLogger("uvicorn.error").info("PromptPrint mode: %s (%s)", MODE, MODE_REASON)
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
# Local mode: one job at a time. Daytona mode: each job has its own sandbox, so up to 3 at once.
droid_lock = asyncio.Semaphore(3 if DAYTONA else 1)
tasks = set()  # keep references so background jobs aren't garbage-collected


class AdapterFailure(BaseModel):
    site: str
    failed_keys: list[str]
    adapter_version: int
    snapshot_html: str
    adapter: dict | None = None  # the adapter that failed; defaults to the published one
    expected_prompt: str | None = None  # text typed in the prompt box when the snapshot was taken
    has_responses: bool = True


def published_adapter(site):
    path = ADAPTERS_DIR / f"{Path(site).name}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


async def run_job(job_id, fn, *args, **kwargs):
    async with droid_lock:
        store.set_status(job_id, "running")
        try:
            summary = await asyncio.to_thread(fn, *args, **kwargs)
        except Exception as e:
            store.set_status(job_id, "failed", error=f"{type(e).__name__}: {e}")
            return
        store.set_status(job_id, "succeeded" if summary.get("success") else "failed", summary=summary,
                         error=None if summary.get("success") else summary.get("error") or "job checks failed")


def start(job_id, fn, *args, **kwargs):
    task = asyncio.create_task(run_job(job_id, fn, *args, **kwargs))
    tasks.add(task)
    task.add_done_callback(tasks.discard)


async def read_body_in_memory(request):
    """The raw body, read into memory with a size cap. UploadFile spools files over 1 MB to a temp
    file on disk, which would break "the export never touches our disk" in Daytona mode."""
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"export over {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
        chunks.append(chunk)
    body = b"".join(chunks)
    content_type = request.headers.get("content-type", "")
    if not content_type.startswith("multipart/form-data"):
        return body, request.query_params.get("filename") or "export"
    # Same multipart form as local mode, parsed in memory.
    message = BytesParser(policy=email.policy.HTTP).parsebytes(
        f"Content-Type: {content_type}\r\n\r\n".encode() + body)
    for part in message.iter_parts():
        if part.get_param("name", header="content-disposition") == "file":
            return part.get_payload(decode=True) or b"", part.get_filename() or "export"
    raise HTTPException(400, "no 'file' field in the form")


@app.post("/upload")
async def upload(request: Request):
    if DAYTONA:
        data, filename = await read_body_in_memory(request)
    else:
        form = await request.form()
        file = form.get("file")
        if not isinstance(file, StarletteUploadFile):
            raise HTTPException(400, "no 'file' field in the form")
        data, filename = await file.read(), file.filename
    if not data:
        raise HTTPException(400, "empty file")
    job_id = store.create("ingest")
    start(job_id, executor.run_ingest_and_analyze, data, filename or "export", job_id)
    return {"job_id": job_id}


@app.get("/jobs/{job_id}")
async def job_status(job_id: str):
    job = store.get(job_id)
    if job is None:
        raise HTTPException(404, "no such job")
    return job


@app.get("/jobs/{job_id}/audit")
async def job_audit(job_id: str):
    """Privacy evidence for one job: its sandbox, and every file that went in or came out of it,
    by name and size only. Local jobs have no sandbox, so those fields are null."""
    job = store.get(job_id)
    if job is None:
        raise HTTPException(404, "no such job")
    summary = job["summary"] or {}
    audit = summary.get("audit") or {}
    return {
        "job_id": job_id, "type": job["type"], "status": job["status"],
        "executor": summary.get("executor") or ("pending" if job["status"] not in DONE else "local"),
        "replayed": bool(summary.get("replayed")),
        "sandbox_id": summary.get("sandbox_id"),
        "created_at": summary.get("created_at"),
        "deleted_at": summary.get("deleted_at"),
        "uploaded": [{"name": f["name"], "bytes": f["bytes"]} for f in audit.get("uploaded", [])],
        "downloaded": [{"name": f["name"], "bytes": f["bytes"]} for f in audit.get("downloaded", [])],
    }


@app.get("/jobs/{job_id}/logs")
async def job_logs(job_id: str):
    if store.get(job_id) is None:
        raise HTTPException(404, "no such job")
    log_dir = executor.log_dir(job_id)

    async def events():
        offsets = {}
        while True:
            sent = False
            # The runner's short logs only, never the full transcripts.
            for path in sorted(log_dir.glob("*.jsonl")) if log_dir.is_dir() else []:
                if path.name.endswith(".transcript.jsonl"):
                    continue
                with path.open("rb") as f:
                    f.seek(offsets.get(path.name, 0))
                    chunk = f.read()
                # Only whole lines; a partly written line waits for the next pass.
                complete = chunk[: chunk.rfind(b"\n") + 1]
                offsets[path.name] = offsets.get(path.name, 0) + len(complete)
                for line in complete.decode("utf-8", errors="replace").splitlines():
                    if line.strip():
                        sent = True
                        yield f"data: {line}\n\n"
            status = store.get(job_id)["status"]
            if status in DONE and not sent:
                yield f"event: end\ndata: {json.dumps({'status': status})}\n\n"
                return
            await asyncio.sleep(LOG_POLL_SECONDS)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/insights/latest")
async def insights_latest():
    job_id = store.latest_succeeded("ingest")
    path = executor.insights_path(job_id) if job_id else None
    if path is None or not path.is_file():
        raise HTTPException(404, "no insights yet")
    return {"job_id": job_id, "insights": json.loads(path.read_text(encoding="utf-8"))}


@app.get("/space/insight")
async def space_insight():
    try:  # from space/cache/; NASA is called only for files missing there
        results = await asyncio.to_thread(nasa_lights.load_or_build)
    except Exception as e:
        raise HTTPException(503, f"night-lights data unavailable: {type(e).__name__}: {e}")
    job_id = store.latest_succeeded("ingest")
    path = executor.insights_path(job_id) if job_id else None
    share = None
    if path is not None and path.is_file():
        share = nasa_lights.your_share(json.loads(path.read_text(encoding="utf-8")), job_id)
    return {**results, "your_share": share}


@app.post("/adapter-failure")
async def adapter_failure(report: AdapterFailure):
    current = published_adapter(report.site)
    current_version = (current or {}).get("version", 0)
    if report.adapter_version < current_version:
        return {"ignored": True, "reason": "report is for an older adapter than the published one",
                "current_version": current_version}
    # No await between this check and create(), so two quick reports can't both start a repair.
    existing = store.active_repair(report.site)
    if existing:
        return {"job_id": existing, "duplicate": True}
    broken = report.adapter or current
    if broken is None:
        raise HTTPException(400, f"no adapter for {report.site!r}: send it in 'adapter'")
    job_id = store.create("repair", site=report.site)
    start(job_id, executor.run_repair, report.site, report.snapshot_html, broken, report.failed_keys, job_id,
          expected_prompt=report.expected_prompt, has_responses=report.has_responses)
    return {"job_id": job_id}
"""Loopback demo API. Importing this module performs no network calls."""

import asyncio
import secrets
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.coaching.config import Settings
from backend.coaching.repository import Repository
from backend.coaching.router import router as coaching_router
from backend.coaching.service import ClassifierService
from backend.integrations.chalk_gateway import Gateway
from backend.integrations.mock_models import MockClassifier
from backend.reports.router import router as reports_router


class RequestBoundary:
    def __init__(self, app, limit=65536, classify_deadline_ms=700):
        self.app, self.limit = app, limit
        self.classify_deadline_ms = classify_deadline_ms

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        scope["started"] = time.monotonic()
        # Buffer a bounded body before validation; covers chunked requests too.
        body = bytearray()
        more = True
        body_budget = (
            self.classify_deadline_ms / 1000 if scope["path"] == "/classify" else 5
        )
        try:
            async with asyncio.timeout(body_budget):
                while more:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    chunk = message.get("body", b"")
                    if len(body) + len(chunk) > self.limit:
                        return await JSONResponse({"detail": "payload_too_large"}, 413)(
                            scope, receive, send
                        )
                    body.extend(chunk)
                    more = message.get("more_body", False)
        except TimeoutError:
            return await JSONResponse({"detail": "request_body_timeout"}, 408)(
                scope, receive, send
            )
        consumed = False

        async def replay():
            nonlocal consumed
            if consumed:
                return await receive()
            consumed = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, replay, send)


def create_app(settings=None, classifier_client=None):
    settings = settings or Settings.from_env()
    profile, policy = settings.artifacts()

    @asynccontextmanager
    async def lifespan(app):
        key = settings.session_secret.get_secret_value() or secrets.token_urlsafe(32)
        repository = Repository(settings.db_path, key, settings.retention_days)
        async with httpx.AsyncClient(
            follow_redirects=False,
            trust_env=False,
            limits=httpx.Limits(max_connections=settings.max_concurrency),
        ) as http:
            client = classifier_client or (
                MockClassifier() if settings.mode == "mock" else Gateway(http, settings)
            )
            app.state.repository = repository
            app.state.classifier = ClassifierService(settings, profile, policy, client)
            try:
                yield
            finally:
                repository.close()

    app = FastAPI(title="Prompt Print coaching", version="1.0.0", lifespan=lifespan)
    app.add_middleware(RequestBoundary, classify_deadline_ms=settings.deadline_ms)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc):
        # FastAPI's default error contains input values, potentially private text.
        return JSONResponse(
            {
                "detail": [
                    {"loc": list(e["loc"]), "type": e["type"]} for e in exc.errors()
                ]
            },
            422,
        )

    @app.get("/health")
    async def health():
        return {
            "status": "ok",
            "mode": settings.mode,
            "coaching_mode": settings.coaching_mode,
        }

    app.include_router(coaching_router)
    app.include_router(reports_router)
    return app


# Use uvicorn backend.main:create_app --factory; no startup on import.
