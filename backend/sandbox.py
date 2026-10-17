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
"""

import io
import json
import os
import shlex
import tarfile
import time
from pathlib import Path

from daytona import AsyncDaytona, CreateSandboxFromSnapshotParams

REPO = Path(__file__).resolve().parents[1]
JOBS_SRC = REPO / "sandbox_jobs"

SANDBOX_HOME = "/home/daytona"  # default sandbox user, found in D0
WORK_DIR = f"{SANDBOX_HOME}/work"
JOBS_DIR = f"{SANDBOX_HOME}/jobs"
DEPS = ["droid-sdk", "pandas", "jsonschema", "beautifulsoup4", "tiktoken", "python-dotenv"]

# Everything that may leave the sandbox. Anything else (prompts.jsonl, input/) stays inside.
DOWNLOAD_FILES = ["output/insights.json", "output/summary.json"]
DOWNLOAD_LOG_DIR = "logs"

EXEC_TIMEOUT = 600


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


async def run_user_jobs(export_bytes, filename, job_id, on_log=None) -> dict:
    log = on_log or (lambda msg: None)
    timings, audit = {}, {"uploaded": [], "downloaded": []}
    result = {"job_id": job_id, "ok": False, "sandbox_id": None, "timings": timings, "audit": audit}
    safe_name = Path(filename).name or "export"

    env_vars = {"WORK_DIR": WORK_DIR}
    if os.environ.get("FACTORY_API_KEY"):
        env_vars["FACTORY_API_KEY"] = os.environ["FACTORY_API_KEY"]

    def mark(step, start):
        timings[step] = round(time.perf_counter() - start, 2)
        log(f"{step}: {timings[step]}s")

    async with AsyncDaytona() as daytona:
        sandbox = None
        try:
            t = time.perf_counter()
            sandbox = await daytona.create(CreateSandboxFromSnapshotParams(
                language="python", env_vars=env_vars, labels={"app": "promptprint", "job_id": job_id},
            ))
            result["sandbox_id"] = sandbox.id
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
            code, _ = await sh(sandbox, f"python3 -u {JOBS_DIR}/run_jobs.py")
            result["run_exit_code"] = code
            mark("run_jobs", t)

            t = time.perf_counter()
            files = {}
            for rel in DOWNLOAD_FILES:
                try:
                    files[rel] = await sandbox.fs.download_file(f"{WORK_DIR}/{rel}")
                except Exception:
                    files[rel] = None  # e.g. no insights.json because a job failed
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
            result["ok"] = result["run_exit_code"] == 0 and bool(result["summary"] and result["summary"].get("ok"))
        except Exception as e:
            result["error"] = f"{type(e).__name__}: {e}"
            log(f"failed: {result['error']}")
        finally:
            if sandbox is not None:
                t = time.perf_counter()
                await daytona.delete(sandbox)
                mark("delete", t)
                log(f"deleted sandbox {sandbox.id}")
    return result
