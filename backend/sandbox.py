"""Per-user sandbox flow (D3 stand-in): run the jobs on one export in a fresh Daytona sandbox.

Stand-in differences from the D3 plan, until our tier allows custom snapshots and Factory's domains:
- default sandbox plus a pip install at the start of each run, instead of promptprint-deps-v1
- jobs live under the sandbox user's home, since the default sandbox user can't write /work or /opt
- no parser cache yet (there is no Droid-written parser.py to cache)

Privacy rules this keeps:
- the export is uploaded straight from memory and never written to the backend's disk
- only insights.json, summary.json and logs/*.jsonl are downloaded; never prompts.jsonl or input/
- the sandbox is deleted in finally, whatever happens
- keys reach the sandbox only through env_vars at creation, never in commands or files

Live logs (D5): the jobs run as an async command in a Daytona process session, and each stdout
line is passed to on_log as it arrives. run_jobs.py prints only events and counts, never chat text.

Leak protection (D7): every sandbox is labeled app=promptprint plus its job_id, is ephemeral
(deleted as soon as it stops), auto-stops when idle, and has a wall-clock TTL, so even a crashed
backend can't leave one running. backend/cleanup_sandboxes.py sweeps anything left over.
"""

import asyncio
import io
import json
import os
import shlex
import tarfile
import time
from datetime import datetime, timezone
from pathlib import Path

from daytona import AsyncDaytona, CreateSandboxFromSnapshotParams, SessionExecuteRequest

REPO = Path(__file__).resolve().parents[1]
JOBS_SRC = REPO / "sandbox_jobs"

SANDBOX_HOME = "/home/daytona"  # default sandbox user, found in D0
WORK_DIR = f"{SANDBOX_HOME}/work"
JOBS_DIR = f"{SANDBOX_HOME}/jobs"
DEPS = ["droid-sdk", "pandas", "jsonschema", "beautifulsoup4", "tiktoken", "python-dotenv"]

# Everything that may leave the sandbox. Anything else (prompts.jsonl, input/) stays inside.
DOWNLOAD_FILES = ["output/insights.json", "output/summary.json"]
DOWNLOAD_LOG_DIR = "logs"

LABELS = {"app": "promptprint"}
AUTO_STOP_MINUTES = 15
TTL_MINUTES = 20
EXEC_TIMEOUT = 600
JOB_TIMEOUT = 600  # overall limit for run_jobs.py
MAX_LOG_LINE = 200


def jobs_tarball():
    """sandbox_jobs/ as an in-memory tar.gz, without samples/ or caches."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for path in sorted(JOBS_SRC.rglob("*")):
            rel = path.relative_to(JOBS_SRC)
            if not path.is_file() or rel.parts[0] == "samples" or "__pycache__" in rel.parts or path.suffix == ".pyc":
                continue
            tar.add(path, arcname=rel.as_posix())
    return buf.getvalue()


async def sh(sandbox, command, timeout=EXEC_TIMEOUT):
    resp = await sandbox.process.exec(f"sh -c {shlex.quote(command)}", timeout=timeout)
    return resp.exit_code, resp.result


class LineStream:
    """Turns streamed log chunks into whole lines for on_log."""

    def __init__(self, emit):
        self.emit, self.buffers, self.count = emit, {"stdout": "", "stderr": ""}, 0

    def feed(self, source, chunk):
        self.buffers[source] += chunk
        *lines, self.buffers[source] = self.buffers[source].split("\n")
        for line in lines:
            self._line(source, line)

    def flush(self):
        for source, rest in self.buffers.items():
            if rest:
                self._line(source, rest)
            self.buffers[source] = ""

    def _line(self, source, line):
        line = line.strip()
        if not line:
            return
        self.count += 1
        try:
            entry = json.loads(line) if source == "stdout" else None
        except json.JSONDecodeError:
            entry = None
        if not isinstance(entry, dict):
            entry = {"event": source, "text": line[:MAX_LOG_LINE]}
        self.emit({"source": "sandbox", **entry})


async def run_streamed(sandbox, command, stream, timeout):
    """Run command as an async session command, streaming its output. Returns (exit_code, timed_out)."""
    session_id = "jobs"
    await sandbox.process.create_session(session_id)
    cmd = await sandbox.process.execute_session_command(
        session_id, SessionExecuteRequest(command=command, run_async=True)
    )
    try:
        await asyncio.wait_for(
            sandbox.process.get_session_command_logs_async(
                session_id, cmd.cmd_id,
                lambda chunk: stream.feed("stdout", chunk),
                lambda chunk: stream.feed("stderr", chunk),
            ),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        stream.flush()
        return None, True
    stream.flush()
    # The log stream can close a moment before the command's exit code is recorded.
    for _ in range(20):
        info = await sandbox.process.get_session_command(session_id, cmd.cmd_id)
        if info.exit_code is not None:
            return info.exit_code, False
        await asyncio.sleep(0.25)
    return None, False


async def run_user_jobs(export_bytes, filename, job_id, on_log=None, job_timeout=JOB_TIMEOUT) -> dict:
    emit = on_log or (lambda entry: None)
    timings, audit = {}, {"uploaded": [], "downloaded": []}
    result = {"job_id": job_id, "ok": False, "sandbox_id": None, "timings": timings, "audit": audit}
    safe_name = Path(filename).name or "export"

    def log(event, **fields):
        emit({"source": "backend", "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
              "event": event, **fields})

    env_vars = {"WORK_DIR": WORK_DIR}
    if os.environ.get("FACTORY_API_KEY"):
        env_vars["FACTORY_API_KEY"] = os.environ["FACTORY_API_KEY"]
    # Not a secret: a test knob that makes the stand-in jobs slow enough to watch the stream.
    if os.environ.get("STANDIN_DELAY"):
        env_vars["STANDIN_DELAY"] = os.environ["STANDIN_DELAY"]

    def mark(step, start):
        timings[step] = round(time.perf_counter() - start, 2)
        log("step_done", step=step, seconds=timings[step])

    async with AsyncDaytona() as daytona:
        sandbox = None
        try:
            t = time.perf_counter()
            sandbox = await daytona.create(CreateSandboxFromSnapshotParams(
                language="python", env_vars=env_vars, labels={**LABELS, "job_id": job_id},
                ephemeral=True, auto_stop_interval=AUTO_STOP_MINUTES, ttl_minutes=TTL_MINUTES,
            ))
            result["sandbox_id"] = sandbox.id
            result["created_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            log("sandbox_created", sandbox_id=sandbox.id)
            mark("create", t)

            t = time.perf_counter()
            code, out = await sh(sandbox, (
                f"mkdir -p {WORK_DIR}/input {WORK_DIR}/output {WORK_DIR}/logs {JOBS_DIR}"
                f" && python3 -m pip install --quiet --disable-pip-version-check {' '.join(DEPS)}"
            ))
            if code != 0:
                raise RuntimeError(f"pip install failed (exit {code}): {out.strip()[-500:]}")
            mark("install", t)

            t = time.perf_counter()
            tarball = jobs_tarball()
            await sandbox.fs.upload_file(tarball, f"{SANDBOX_HOME}/jobs.tar.gz")
            code, out = await sh(sandbox, f"tar -xzf {SANDBOX_HOME}/jobs.tar.gz -C {JOBS_DIR} && rm {SANDBOX_HOME}/jobs.tar.gz")
            if code != 0:
                raise RuntimeError(f"extract failed (exit {code}): {out.strip()}")
            audit["uploaded"].append({"name": "jobs.tar.gz", "bytes": len(tarball)})
            mark("upload_code", t)

            t = time.perf_counter()
            size = len(export_bytes)
            await sandbox.fs.upload_file(export_bytes, f"{WORK_DIR}/input/{safe_name}")
            export_bytes = None  # drop our reference; the export now lives only in the sandbox
            audit["uploaded"].append({"name": f"input/{safe_name}", "bytes": size})
            mark("upload_export", t)

            t = time.perf_counter()
            stream = LineStream(emit)
            code, timed_out = await run_streamed(sandbox, f"python3 -u {JOBS_DIR}/run_jobs.py", stream, job_timeout)
            result["run_exit_code"], result["timed_out"], result["streamed_lines"] = code, timed_out, stream.count
            if timed_out:
                result["error"] = f"timed out after {job_timeout}s"
                log("job_timeout", seconds=job_timeout)
            mark("run_jobs", t)

            # Runs on timeout too, so whatever logs exist come back.
            t = time.perf_counter()
            files = {}
            for rel in DOWNLOAD_FILES:
                try:
                    files[rel] = await sandbox.fs.download_file(f"{WORK_DIR}/{rel}")
                except Exception:
                    files[rel] = None  # e.g. no insights.json because a job failed or timed out
            code, names = await sh(sandbox, f"cd {WORK_DIR}/{DOWNLOAD_LOG_DIR} && ls *.jsonl 2>/dev/null")
            for name in names.split() if code == 0 else []:
                rel = f"{DOWNLOAD_LOG_DIR}/{Path(name).name}"
                files[rel] = await sandbox.fs.download_file(f"{WORK_DIR}/{rel}")
            for rel, data in files.items():
                if data is not None:
                    audit["downloaded"].append({"name": rel, "bytes": len(data)})
            mark("download", t)

            insights, summary = files.get("output/insights.json"), files.get("output/summary.json")
            result["insights"] = json.loads(insights) if insights else None
            result["summary"] = json.loads(summary) if summary else None
            result["logs"] = {
                rel: [json.loads(line) for line in data.decode("utf-8").splitlines() if line.strip()]
                for rel, data in files.items() if rel.startswith(DOWNLOAD_LOG_DIR) and data
            }
            result["ok"] = (not timed_out and result["run_exit_code"] == 0
                            and bool(result["summary"] and result["summary"].get("ok")))
        except Exception as e:
            result["error"] = f"{type(e).__name__}: {e}"
            log("failed", error=result["error"][:MAX_LOG_LINE])
        finally:
            if sandbox is not None:
                t = time.perf_counter()
                await daytona.delete(sandbox)
                result["deleted_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
                mark("delete", t)
                log("sandbox_deleted", sandbox_id=sandbox.id)
    return result
