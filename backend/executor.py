"""F6: where the Droid jobs run, behind one interface.

JobExecutor has two calls, and the backend only ever talks to it:
  run_ingest_and_analyze(export_bytes, filename, job_id) -> summary dict
  run_repair(site, snapshot_html, broken_adapter, failed_keys, job_id, ...) -> summary dict
LocalExecutor runs the existing sandbox_jobs scripts on this machine, each job in its own folder
work/jobs/<job_id>/ (and Droid's view in droid_view/jobs/<job_id>/). DaytonaExecutor keeps the real
export in a Daytona sandbox and runs Droid here on a redacted copy (see its docstring). EXECUTOR
picks one: "local" (default) or "daytona". DEMO_REPLAY=1 swaps in ReplayExecutor, which replays a
saved successful run (see below) for when Wi-Fi or Droid fails.

Each method blocks for minutes, so the backend calls it from a worker thread. The job scripts'
console output isn't kept: it can include insight titles about the user's data, and the
privacy rule is to never log prompt or response text. Logs for the UI are the runner's
<job>.jsonl files.
"""

import asyncio
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
PARSER_CACHE = Path(os.environ.get("PARSER_CACHE", REPO / "parser_cache"))  # same default as ingest.py


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

    def _env(self, job_id, extra_env=None):
        env = dict(os.environ, WORK_DIR=str(self.work_dir(job_id)), DROID_VIEW_DIR=str(VIEW_ROOT / job_id),
                   PYTHONUNBUFFERED="1", PYTHONIOENCODING="utf-8", **(extra_env or {}))
        user_bin = Path(os.environ.get("USERPROFILE", "~")).expanduser() / "bin"  # where the droid installer puts it
        if (user_bin / "droid.exe").exists() and str(user_bin) not in env.get("PATH", ""):
            env["PATH"] = f"{user_bin}{os.pathsep}{env.get('PATH', '')}"
        return env

    def _run(self, args, job_id, timeout, extra_env=None):
        """Run a job script; its console output is discarded (see the module docstring)."""
        try:
            proc = subprocess.run([sys.executable, *args], cwd=REPO, env=self._env(job_id, extra_env), timeout=timeout,
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

    def _clean_snapshot(self, snapshot_html, job_id):
        """Leave the cleaned page in input/snapshot.html. Returns (ok, extra fields for the summary)."""
        inp = self.work_dir(job_id) / "input"
        raw = inp / "raw_snapshot.html"
        raw.write_text(snapshot_html, encoding="utf-8")
        cleaned = subprocess.run([sys.executable, str(JOBS / "samples" / "clean_snapshot.py"), str(raw),
                                  str(inp / "snapshot.html")], capture_output=True, text=True)
        raw.unlink()
        return cleaned.returncode == 0, {}

    def run_repair(self, site, snapshot_html, broken_adapter, failed_keys, job_id,
                   expected_prompt=None, has_responses=True):
        work = self.work_dir(job_id)
        inp = work / "input"
        inp.mkdir(parents=True, exist_ok=True)
        # Droid reads the page, so it only ever gets the cleaned copy (no sidebar, scripts or emails).
        cleaned, extra = self._clean_snapshot(snapshot_html, job_id)
        if not cleaned:
            return {"success": False, **extra,
                    "error": extra.get("error") or "snapshot still has an email or conversation link after cleaning"}
        (inp / "expected.json").write_text(json.dumps({"prompt": expected_prompt, "model": None,
                                                       "has_responses": has_responses}), encoding="utf-8")
        (inp / "broken_adapter.json").write_text(json.dumps(broken_adapter, indent=2), encoding="utf-8")
        args = [str(JOBS / "repair_adapter.py"), "--site", site, "--snapshot", str(inp / "snapshot.html"),
                "--adapter", str(inp / "broken_adapter.json"), "--expected", str(inp / "expected.json")]
        if failed_keys:
            args += ["--failed", *failed_keys]
        code = self._run(args, job_id, timeout=900)
        summary = self._read(work / "mechanic" / "output" / "repair_summary.json") or {}
        return {**summary, **extra, "success": code == 0 and bool(summary.get("success")), "exit_code": code}


class DaytonaExecutor(LocalExecutor):
    """D4 hybrid: the real export lives only in a Daytona sandbox; Droid runs here on a redacted copy.

    Our Daytona tier blocks Factory's domains, so Droid can't run inside the sandbox. Instead
    (backend/sandbox.py, run_hybrid_jobs):
      1. the export is uploaded from memory into a fresh sandbox, which runs lib/redact.py; only the
         redacted copy comes back, into this job's input/
      2. here, ingest.py then analyze.py with REDACTED_INPUT=1: the Ingestor and Analyst as in local
         mode, but every "real data" step runs on the redacted copy, as a first check
      3. the parser.py and analyze.py Droid wrote go into the sandbox, run_real.py runs them on the real
         export with our validator and checks, and only insights.json and summary.json come back
      4. the sandbox is deleted in finally
    The export and its prompts.jsonl never reach this machine's disk.

    Repairs (D6, same hybrid): the raw page snapshot goes from memory into a short-lived sandbox,
    clean_snapshot.py runs there, and only the cleaned page comes back (clean_snapshot_in_sandbox).
    From there it's the local repair: repair_adapter.py has Droid fix the adapter here from the
    cleaned page, runs our check_adapter.py here, and publishes only if it passes.

    Sandbox events go to logs/sandbox.jsonl, which /jobs/{id}/logs streams with Droid's logs.
    """

    def _sandbox_log(self, job_id):
        path = self.log_dir(job_id) / "sandbox.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)

        def on_log(entry):  # events and counts only, never page or chat text
            with path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")
        return on_log

    def _clean_snapshot(self, snapshot_html, job_id):
        from backend.sandbox import clean_snapshot_in_sandbox

        result = asyncio.run(clean_snapshot_in_sandbox(snapshot_html, job_id, on_log=self._sandbox_log(job_id)))
        extra = {"executor": "daytona", "error": result.get("error"),
                 **{k: result.get(k) for k in ("sandbox_id", "timings", "audit", "cleaner", "created_at",
                                               "deleted_at")}}
        if not result["ok"]:
            return False, extra
        (self.work_dir(job_id) / "input" / "snapshot.html").write_text(result["cleaned"], encoding="utf-8")
        return True, extra

    def _droid_step(self, job_id):
        work = self.work_dir(job_id)

        def step(redacted, suffix):
            for p in (work / "input").iterdir():
                p.unlink()
            (work / "input" / f"export{suffix}").write_bytes(redacted)
            env = {"REDACTED_INPUT": "1"}
            # The two jobs run separately (not via run_jobs.py) because analyze.py clears droid/,
            # where the Ingestor leaves parser.py.
            code = self._run([str(JOBS / "ingest.py")], job_id, timeout=900, extra_env=env)
            ingest = self._read(work / "output" / "ingest_summary.json") or {}
            parser = work / "droid" / "parser.py"
            parser_bytes = parser.read_bytes() if code == 0 and parser.is_file() else None
            analyze = {}
            if parser_bytes is not None and ingest.get("success"):
                code = self._run([str(JOBS / "analyze.py")], job_id, timeout=900, extra_env=env)
                analyze = self._read(work / "output" / "analyze_summary.json") or {}
                parser.write_bytes(parser_bytes)  # back in droid/, for the parser cache
            # Insights computed from placeholders were only a check; the real ones come from the sandbox.
            (work / "output" / "insights.json").unlink(missing_ok=True)
            script = work / "droid" / "analyze.py"
            ok = (code == 0 and bool(ingest.get("success")) and bool(analyze.get("success"))
                  and parser_bytes is not None and script.is_file())
            return {
                "ok": ok, "exit_code": code, "ingest": ingest, "analyze": analyze,
                "parser": parser_bytes if ok else None,
                "analyze_py": script.read_bytes() if ok else None,
                "expected": {k: ingest.get(k) for k in ("exchanges", "regenerations", "images")},
            }
        return step

    def run_ingest_and_analyze(self, export_bytes, filename, job_id):
        from backend.sandbox import run_hybrid_jobs  # only Daytona mode needs the daytona package

        work = self.work_dir(job_id)
        for name in ("input", "lib", "droid", "output", "logs"):
            (work / name).mkdir(parents=True, exist_ok=True)
        result = asyncio.run(run_hybrid_jobs(export_bytes, filename, job_id, self._droid_step(job_id),
                                             on_log=self._sandbox_log(job_id)))
        droid = result.get("droid") or {}
        ingest, analyze, real = droid.get("ingest") or {}, droid.get("analyze") or {}, result.get("summary") or {}
        if result["ok"]:
            self.insights_path(job_id).write_text(json.dumps(result["insights"], indent=2), encoding="utf-8")
            # Cache the parser only now that it has passed on the real export.
            parser = work / "droid" / "parser.py"
            if not ingest.get("cache_hit") and real.get("fingerprint") and parser.is_file():
                (PARSER_CACHE / real["fingerprint"]).mkdir(parents=True, exist_ok=True)
                shutil.copy2(parser, PARSER_CACHE / real["fingerprint"] / "parser.py")
        return {
            "success": result["ok"],
            "executor": "daytona",
            "error": result.get("error"),
            "exit_code": droid.get("exit_code"),
            "ingest": {**{k: ingest.get(k) for k in ("success", "cache_hit", "duration", "credits")},
                       **{k: (real.get("ingest") or {}).get(k) for k in ("exchanges", "regenerations", "images",
                                                                        "models")}},
            "analyze": analyze,
            "real_run": {k: real.get(k) for k in ("ok", "counts_match", "checks", "timings", "error")},
            "factory_credits": sum(s.get("credits") or 0 for s in (ingest, analyze)),
            "has_insights": self.insights_path(job_id).is_file(),
            "sandbox_id": result.get("sandbox_id"),
            "timings": result.get("timings"),
            "audit": result.get("audit"),
            "created_at": result.get("created_at"),
            "deleted_at": result.get("deleted_at"),
        }


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
    if name == "daytona":
        return DaytonaExecutor()
    raise ValueError(f"EXECUTOR={name!r} isn't available (use 'local' or 'daytona')")
