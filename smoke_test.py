"""Smoke test of the whole product flow, through the real backend started with start.py.

    py smoke_test.py            free: Droid's saved outputs, everything else real
    py smoke_test.py --live     real Droid calls for all three jobs (costs Factory credits:
                                roughly 100,000 for an upload, 5,000 for a repair)

Flow 1, upload: POST /upload (the planted sample) -> sandbox redacts it -> Droid on the redacted copy
-> Droid's scripts run on the real export in the sandbox -> /insights/latest -> /jobs/{id}/audit.
Flow 2, repair: break the published adapter -> POST /adapter-failure -> sandbox cleans the page ->
Droid repairs -> our checker -> published one version up. The published adapter is restored
afterwards (--keep-adapter leaves the new version).

Without --live, DROID_SAVED_DIR=backend/demo_runs/droid_outputs: the parser.py and analyze.py Droid
wrote in the Daytona rehearsal and the adapter it wrote in a saved repair stand in for Droid's calls
(the Ingestor hits the parser cache instead if this export's format is cached). Sandboxes, redaction,
our validator and checks, the real-data run, publishing and the audit all run for real. The mode
follows the same rule as start.py: Daytona if DAYTONA_API_KEY is set, local if not. Keys come from
.env and are never printed.
"""

import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parent
SAMPLE = REPO / "sandbox_jobs" / "samples" / "chatgpt_planted" / "conversations.json"
MARKERS = [m.strip() for m in (SAMPLE.parent / "markers.txt").read_text(encoding="utf-8").splitlines()
           if m.strip() and not m.startswith("#")]
PAGE = REPO / "sandbox_jobs" / "samples" / "chatgpt_page"
PUBLISHED = REPO / "backend" / "adapters" / "chatgpt.json"
SAVED_OUTPUTS = REPO / "backend" / "demo_runs" / "droid_outputs"
# What a Daytona-mode job may download from its sandbox.
ALLOWED_DOWNLOADS = {"upload": {"redacted/export.json", "output/insights.json", "output/summary.json"},
                     "repair": {"output/snapshot.html"}}

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{': ' + str(detail) if detail != '' else ''}", flush=True)
    return ok


def http(base, method, path, body=None, headers=None, timeout=30):
    req = urllib.request.Request(base + path, data=body, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def post_file(base, path, filename, data):
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
            f"Content-Type: application/json\r\n\r\n").encode() + data + f"\r\n--{boundary}--\r\n".encode()
    return http(base, "POST", path, body, {"Content-Type": f"multipart/form-data; boundary={boundary}"})


def wait_job(base, job_id, timeout):
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        job = http(base, "GET", f"/jobs/{job_id}")
        if job["status"] in ("succeeded", "failed"):
            return job, round(time.monotonic() - start, 1)
        time.sleep(2)
    raise TimeoutError(f"job {job_id} still running after {timeout}s")


def read_log_stream(base, job_id):
    """The job's /logs stream from the start; it ends with an 'end' event once the job is done."""
    lines = []
    with urllib.request.urlopen(base + f"/jobs/{job_id}/logs", timeout=60) as resp:
        for raw in resp:
            line = raw.decode("utf-8", errors="replace").rstrip("\n")
            if line.startswith("event: end"):
                break
            if line.startswith("data: "):
                lines.append(line[6:])
    return lines


def markers_in(text):
    return [m for m in MARKERS if m.lower() in text.lower()]


def check_audit(base, job_id, kind, daytona):
    audit = http(base, "GET", f"/jobs/{job_id}/audit")
    if not daytona:
        check(f"{kind}: audit (local mode, no sandbox)", audit["sandbox_id"] is None, audit["executor"])
        return audit
    names = {d["name"] for d in audit["downloaded"]}
    check(f"{kind}: ran in a sandbox, then deleted", audit["sandbox_id"] and audit["deleted_at"], audit["sandbox_id"])
    check(f"{kind}: downloaded only allowed files", names <= ALLOWED_DOWNLOADS[kind],
          ", ".join(f"{d['name']} ({d['bytes']:,} B)" for d in audit["downloaded"]))
    return audit


def upload_flow(base, daytona, live):
    print("\n== Flow 1: upload -> redact -> Droid -> real-data run -> insights -> audit", flush=True)
    job_id = post_file(base, "/upload", SAMPLE.name, SAMPLE.read_bytes())["job_id"]
    print(f"  upload job {job_id}", flush=True)
    job, seconds = wait_job(base, job_id, 2400 if live else 600)
    summary = job["summary"] or {}
    check("upload: job succeeded", job["status"] == "succeeded", job["error"] or f"{seconds}s")
    ingest = summary.get("ingest") or {}
    check("upload: counts", ingest.get("exchanges") == 12 and ingest.get("regenerations") == 1
          and ingest.get("images") == 1, {k: ingest.get(k) for k in ("exchanges", "regenerations", "images")})
    if daytona:
        real = summary.get("real_run") or {}
        check("upload: our checks on the real export in the sandbox",
              real.get("ok") and real.get("counts_match"), {k: v["ok"] for k, v in (real.get("checks") or {}).items()})
    analyze = summary.get("analyze") or {}
    check("upload: Droid's work", ingest.get("success") and analyze.get("success"),
          f"ingest {'parser cache hit' if ingest.get('cache_hit') else 'new parser'}, "
          f"analyst {analyze.get('droid_subtype')} (saved = Droid's saved output, no Droid call)")
    if not live:
        check("upload: no Factory credits spent", (summary.get("factory_credits") or 0) == 0, summary.get("factory_credits"))
    latest = http(base, "GET", "/insights/latest")
    tips = latest["insights"].get("tips", [])
    check("upload: /insights/latest serves this job", latest["job_id"] == job_id and len(tips) == 3,
          [t.get("pattern") for t in tips])
    check_audit(base, job_id, "upload", daytona)
    stream = read_log_stream(base, job_id)
    check("upload: /logs streams events with no planted text", stream and not markers_in("\n".join(stream)),
          f"{len(stream)} lines")
    if daytona:  # nothing from the export on the backend's disk, except the insights we asked for
        work = REPO / "work" / "jobs" / job_id
        leaks = [str(p.relative_to(work)) for p in work.rglob("*") if p.is_file()
                 and p != work / "output" / "insights.json" and markers_in(p.read_bytes().decode("utf-8", "ignore"))]
        check("upload: no planted text on the backend's disk", not leaks, leaks or "checked every file in the job folder")
    return summary


def repair_flow(base, daytona, live, keep_adapter):
    print("\n== Flow 2: break adapter -> sandbox cleans page -> Droid repair -> checker -> publish", flush=True)
    original = PUBLISHED.read_bytes()
    published = json.loads(original)
    tmp = Path(tempfile.mkdtemp(prefix="smoke_"))
    try:
        broken_path = tmp / "broken.json"
        subprocess.run([sys.executable, str(REPO / "sandbox_jobs" / "samples" / "break_adapter.py"), str(PUBLISHED),
                        "--out", str(broken_path)], check=True, capture_output=True)
        broken = json.loads(broken_path.read_text(encoding="utf-8"))
        expected = json.loads((PAGE / "expected.json").read_text(encoding="utf-8"))
        report = {"site": "chatgpt", "failed_keys": ["prompt_box", "send_button"],
                  "adapter_version": published["version"], "adapter": broken,
                  "snapshot_html": (PAGE / "snapshot.html").read_text(encoding="utf-8"),
                  "expected_prompt": expected["prompt"], "has_responses": expected["has_responses"]}
        job_id = http(base, "POST", "/adapter-failure", json.dumps(report).encode(),
                      {"Content-Type": "application/json"})["job_id"]
        print(f"  repair job {job_id}", flush=True)
        job, seconds = wait_job(base, job_id, 1200 if live else 300)
        summary = job["summary"] or {}
        check("repair: job succeeded", job["status"] == "succeeded", job["error"] or f"{seconds}s")
        now = json.loads(PUBLISHED.read_text(encoding="utf-8"))
        check("repair: our checker passed and the adapter was published one version up",
              summary.get("success") and now["version"] == published["version"] + 1,
              f"v{published['version']} -> v{now['version']}, {summary.get('published')}")
        if not live:
            check("repair: no Factory credits spent", (summary.get("credits") or 0) == 0, summary.get("credits"))
        check_audit(base, job_id, "repair", daytona)
        return summary
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        if not keep_adapter and PUBLISHED.read_bytes() != original:
            PUBLISHED.write_bytes(original)
            print(f"  (restored {PUBLISHED.relative_to(REPO)} to v{published['version']})")


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--live", action="store_true", help="call Droid for real (costs Factory credits)")
    ap.add_argument("--keep-adapter", action="store_true", help="leave the repaired adapter published")
    args = ap.parse_args()

    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    env.pop("DEMO_REPLAY", None)
    cache = None
    if args.live:
        print("--live: Droid runs for real, with an empty parser cache. This costs Factory credits.")
        cache = Path(tempfile.mkdtemp(prefix="smoke_cache_"))
        env["PARSER_CACHE"] = str(cache)
        env.pop("DROID_SAVED_DIR", None)
    else:
        env["DROID_SAVED_DIR"] = str(SAVED_OUTPUTS)
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    # The repair job publishes to BACKEND_URL; point it here, not at a dev server on :8000.
    env["BACKEND_URL"] = base
    server_log = Path(tempfile.mkdtemp(prefix="smoke_server_")) / "server.log"
    with server_log.open("w", encoding="utf-8") as log:
        server = subprocess.Popen([sys.executable, str(REPO / "start.py"), "--port", str(port)], cwd=REPO,
                                  env=env, stdout=log, stderr=subprocess.STDOUT)
    start = time.monotonic()
    try:
        for _ in range(120):
            try:
                urllib.request.urlopen(base + "/docs", timeout=2)
                break
            except OSError:
                if server.poll() is not None:
                    raise SystemExit(f"backend exited; see {server_log}")
                time.sleep(1)
        mode = re.search(r"PromptPrint mode: (\w+) \(([^)]*)\)", server_log.read_text(encoding="utf-8"))
        print(f"backend on {base}, mode: {mode.group(1)} ({mode.group(2)})" if mode else f"backend on {base}")
        print(f"Droid: {'live' if args.live else 'saved outputs from ' + str(SAVED_OUTPUTS.relative_to(REPO))}")
        daytona = bool(mode and mode.group(1) == "daytona")
        upload = upload_flow(base, daytona, args.live)
        repair = repair_flow(base, daytona, args.live, args.keep_adapter)
    finally:
        server.terminate()
        server.wait(timeout=30)
        if cache:
            shutil.rmtree(cache, ignore_errors=True)

    credits = (upload.get("factory_credits") or 0) + (repair.get("credits") or 0)
    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed in {time.monotonic() - start:.0f}s; "
          f"Factory credits: {credits:,.0f}")
    print(f"upload sandbox timings: {upload.get('timings')}")
    print(f"repair sandbox timings: {repair.get('timings')}")
    if failed:
        print("FAILED: " + "; ".join(failed) + f"\nbackend log: {server_log}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
