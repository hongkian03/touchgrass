"""F6: where the Droid jobs run, behind one interface.

JobExecutor has two calls, and the backend only ever talks to it:
  run_ingest_and_analyze(export_bytes, filename, job_id) -> summary dict
  run_repair(site, snapshot_html, broken_adapter, failed_keys, job_id, ...) -> summary dict
LocalExecutor runs the existing sandbox_jobs scripts on this machine, each job in its own folder
work/jobs/<job_id>/ (and Droid's view in droid_view/jobs/<job_id>/). A DaytonaExecutor will run the
same scripts in a sandbox. EXECUTOR picks one (default "local"). DEMO_REPLAY=1 swaps in
ReplayExecutor, which replays a saved successful run (see below) for when Wi-Fi or Droid fails.

Each method blocks for minutes, so the backend calls it from a worker thread. The job scripts'
console output isn't kept: it can include insight titles about the user's data, and the
privacy rule is to never log prompt or response text. Logs for the UI are the runner's
<job>.jsonl files.
"""

import json
import os
import shutil
import subprocess
import sys
import time
from abc import ABC, abstractmethod
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
JOBS = REPO / "sandbox_jobs"
JOB_ROOT = REPO / "work" / "jobs"
VIEW_ROOT = REPO / "droid_view" / "jobs"


class JobExecutor(ABC):
    @abstractmethod
    def run_ingest_and_analyze(self, export_bytes, filename, job_id) -> dict: ...

    @abstractmethod
    def run_repair(self, site, snapshot_html, broken_adapter, failed_keys, job_id,
                   expected_prompt=None, has_responses=True) -> dict: ...

    @abstractmethod
    def log_dir(self, job_id) -> Path: ...

    @abstractmethod
    def insights_path(self, job_id) -> Path: ...


class LocalExecutor(JobExecutor):
    def work_dir(self, job_id):
        return JOB_ROOT / job_id

    def log_dir(self, job_id):
        return self.work_dir(job_id) / "logs"

    def insights_path(self, job_id):
        return self.work_dir(job_id) / "output" / "insights.json"

    def _env(self, job_id):
        env = dict(os.environ, WORK_DIR=str(self.work_dir(job_id)), DROID_VIEW_DIR=str(VIEW_ROOT / job_id),
                   PYTHONUNBUFFERED="1", PYTHONIOENCODING="utf-8")
        user_bin = Path(os.environ.get("USERPROFILE", "~")).expanduser() / "bin"  # where the droid installer puts it
        if (user_bin / "droid.exe").exists() and str(user_bin) not in env.get("PATH", ""):
            env["PATH"] = f"{user_bin}{os.pathsep}{env.get('PATH', '')}"
        return env

    def _run(self, args, job_id, timeout):
        """Run a job script; its console output is discarded (see the module docstring)."""
        try:
            proc = subprocess.run([sys.executable, *args], cwd=REPO, env=self._env(job_id), timeout=timeout,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return proc.returncode
        except subprocess.TimeoutExpired:
            return None

    @staticmethod
    def _read(path):
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None

    def run_ingest_and_analyze(self, export_bytes, filename, job_id):
        work = self.work_dir(job_id)
        for name in ("input", "lib", "droid", "output", "logs"):
            (work / name).mkdir(parents=True, exist_ok=True)
        export = work / "input" / (Path(filename).name or "export")
        export.write_bytes(export_bytes)
        try:
            code = self._run([str(JOBS / "run_jobs.py"), "--droid"], job_id, timeout=1800)
        finally:
            # Privacy: the export and the extracted prompts don't outlive the job.
            for p in (work / "input").iterdir():
                p.unlink()
            (work / "output" / "prompts.jsonl").unlink(missing_ok=True)
        ingest = self._read(work / "output" / "ingest_summary.json")
        analyze = self._read(work / "output" / "analyze_summary.json")
        credits = sum((s or {}).get("credits") or 0 for s in (ingest, analyze))
        return {
            "success": code == 0 and bool(ingest and ingest.get("success")) and bool(analyze and analyze.get("success")),
            "exit_code": code,
            "ingest": {k: (ingest or {}).get(k) for k in ("success", "cache_hit", "exchanges", "regenerations",
                                                          "images", "models", "duration", "credits")},
            "analyze": analyze,
            "factory_credits": credits,
            "has_insights": self.insights_path(job_id).is_file(),
        }

    def run_repair(self, site, snapshot_html, broken_adapter, failed_keys, job_id,
                   expected_prompt=None, has_responses=True):
        work = self.work_dir(job_id)
        inp = work / "input"
        inp.mkdir(parents=True, exist_ok=True)
        raw = inp / "raw_snapshot.html"
        raw.write_text(snapshot_html, encoding="utf-8")
        # Droid reads the page, so it only ever gets the cleaned copy (no sidebar, scripts or emails).
        cleaned = subprocess.run([sys.executable, str(JOBS / "samples" / "clean_snapshot.py"), str(raw),
                                  str(inp / "snapshot.html")], capture_output=True, text=True)
        raw.unlink()
        if cleaned.returncode != 0:
            return {"success": False, "error": "snapshot still has an email or conversation link after cleaning"}
        (inp / "expected.json").write_text(json.dumps({"prompt": expected_prompt, "model": None,
                                                       "has_responses": has_responses}), encoding="utf-8")
        (inp / "broken_adapter.json").write_text(json.dumps(broken_adapter, indent=2), encoding="utf-8")
        args = [str(JOBS / "repair_adapter.py"), "--site", site, "--snapshot", str(inp / "snapshot.html"),
                "--adapter", str(inp / "broken_adapter.json"), "--expected", str(inp / "expected.json")]
        if failed_keys:
            args += ["--failed", *failed_keys]
        code = self._run(args, job_id, timeout=900)
        summary = self._read(work / "mechanic" / "output" / "repair_summary.json") or {}
        return {**summary, "success": code == 0 and bool(summary.get("success")), "exit_code": code}


DEMO_RUNS = REPO / "backend" / "demo_runs"


class ReplayExecutor(LocalExecutor):
    """Demo fallback: replays a saved successful run instead of calling Droid.

    The saved log lines are written into the job's log folder at their original pace, so
    GET /jobs/{id}/logs streams them exactly as it would a live run. Then the saved results
    (insights.json, or the repaired adapter) are put where a live run would leave them. The job
    summary says "replayed": true, so the dashboard can label it. Save runs with
    backend/save_demo_run.py. REPLAY_SPEED speeds it up (2 = twice as fast); default 1 (real speed).
    """

    def __init__(self, runs=DEMO_RUNS, speed=None):
        self.runs = Path(runs)
        self.speed = float(speed or os.environ.get("REPLAY_SPEED", "1"))

    def _replay_logs(self, run, job_id):
        from datetime import datetime

        logs = self.log_dir(job_id)
        logs.mkdir(parents=True, exist_ok=True)
        previous = None
        for name in json.loads((run / "summary.json").read_text(encoding="utf-8"))["log_order"]:
            src = run / "logs" / name
            with (logs / name).open("a", encoding="utf-8") as out:
                for line in src.read_text(encoding="utf-8").splitlines():
                    if not line.strip():
                        continue
                    at = datetime.fromisoformat(json.loads(line)["ts"])
                    if previous is not None:
                        time.sleep(max(0.0, (at - previous).total_seconds()) / self.speed)
                    previous = at
                    out.write(line + "\n")
                    out.flush()

    def run_ingest_and_analyze(self, export_bytes, filename, job_id):
        run = self.runs / "upload"
        self._replay_logs(run, job_id)
        out = self.insights_path(job_id)
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(run / "insights.json", out)
        saved = json.loads((run / "summary.json").read_text(encoding="utf-8"))
        return {**saved["job_summary"], "replayed": True, "replayed_from": saved["saved_from_job"]}

    def run_repair(self, site, snapshot_html, broken_adapter, failed_keys, job_id,
                   expected_prompt=None, has_responses=True):
        run = self.runs / "repair"
        self._replay_logs(run, job_id)
        adapter = json.loads((run / "adapter.json").read_text(encoding="utf-8"))
        # Publish above whatever is live, so the extension picks it up as a new version.
        path = REPO / "backend" / "adapters" / f"{Path(site).name}.json"
        current = json.loads(path.read_text(encoding="utf-8")).get("version", 0) if path.is_file() else 0
        adapter["version"] = max(current, broken_adapter.get("version", 0)) + 1
        path.write_text(json.dumps(adapter, indent=2) + "\n", encoding="utf-8")
        saved = json.loads((run / "summary.json").read_text(encoding="utf-8"))
        return {**saved["job_summary"], "version": adapter["version"], "published": f"replay wrote {path.name}",
                "replayed": True, "replayed_from": saved["saved_from_job"]}


def get_executor():
    if os.environ.get("DEMO_REPLAY") == "1":
        return ReplayExecutor()
    name = os.environ.get("EXECUTOR", "local").lower()
    if name == "local":
        return LocalExecutor()
    raise ValueError(f"EXECUTOR={name!r} isn't available yet (only 'local'; DaytonaExecutor is planned)")
