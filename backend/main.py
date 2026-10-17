"""PromptPrint backend (F6): user actions and capture failures trigger the Droid jobs.

Routes:
  POST /upload                 chat export (multipart) -> {job_id}; runs ingest then analyze
  GET  /jobs/{job_id}          status and summary
  GET  /jobs/{job_id}/logs     Server-Sent Events: the job's Droid log lines as they're written
  GET  /insights/latest        the latest successful analysis's insights.json
  POST /adapter-failure        {site, failed_keys, adapter_version, snapshot_html, ...} -> {job_id}

One Droid job runs at a time (an asyncio lock); the rest wait as "queued". Jobs run in a worker
thread so requests keep being served while Droid works. Run: py -m uvicorn backend.main:app
"""

import asyncio
import json
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.executor import REPO, get_executor
from backend.jobs import DONE, JobStore

ADAPTERS_DIR = REPO / "backend" / "adapters"
LOG_POLL_SECONDS = 0.5

app = FastAPI(title="PromptPrint")
store = JobStore()
executor = get_executor()
droid_lock = asyncio.Lock()
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


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty file")
    job_id = store.create("ingest")
    start(job_id, executor.run_ingest_and_analyze, data, file.filename or "export", job_id)
    return {"job_id": job_id}


@app.get("/jobs/{job_id}")
async def job_status(job_id: str):
    job = store.get(job_id)
    if job is None:
        raise HTTPException(404, "no such job")
    return job


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
