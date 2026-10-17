"""Entry point for the jobs: Job 1 (ingest), our validator, then Job 2 (analyze).

Default: the hand-written stand-ins in standin/, which is what the Daytona sandbox runs until droid
can reach Factory from there. With --droid: the real Droid jobs, ingest.py then analyze.py, each
with its own independent checks. Everything reads WORK_DIR from the environment.

Usage: py sandbox_jobs/run_jobs.py [--droid]

Writes WORK_DIR/output/prompts.jsonl (stays in the sandbox), WORK_DIR/output/insights.json,
WORK_DIR/output/summary.json, and WORK_DIR/logs/run.jsonl. Log lines hold events and counts only,
never chat text. Exit code 1 if any step fails.
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

JOBS_DIR = Path(__file__).resolve().parent
WORK = Path(os.environ.get("WORK_DIR", "work"))
INPUT, OUTPUT, LOGS = WORK / "input", WORK / "output", WORK / "logs"
# Seconds each stand-in step sleeps, to imitate Droid's run time when testing streaming and timeouts.
STANDIN_DELAY = float(os.environ.get("STANDIN_DELAY", "0"))
MAX_FIELD = 200

sys.path.insert(0, str(JOBS_DIR / "standin"))
import analyze  # noqa: E402
import parse_chatgpt  # noqa: E402


def log(event, **fields):
    fields = {k: v[:MAX_FIELD] if isinstance(v, str) else v for k, v in fields.items()}
    line = {"ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"), "event": event, **fields}
    with (LOGS / "run.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(line) + "\n")
    print(json.dumps(line), flush=True)


def timed(summary, name, fn):
    t = time.perf_counter()
    log(f"{name}_start")
    if STANDIN_DELAY:
        time.sleep(STANDIN_DELAY)
    result = fn()
    summary["timings"][name] = round(time.perf_counter() - t, 3)
    log(f"{name}_done", seconds=summary["timings"][name])
    return result


def main():
    for d in (INPUT, OUTPUT, LOGS):
        d.mkdir(parents=True, exist_ok=True)
    summary = {"ok": False, "timings": {}}
    try:
        exports = sorted(p for p in INPUT.iterdir() if p.is_file())
        if len(exports) != 1:
            raise RuntimeError(f"expected 1 file in input, found {len(exports)}")
        prompts = OUTPUT / "prompts.jsonl"

        convs, rows = timed(summary, "ingest", lambda: parse_chatgpt.main(exports[0], prompts))
        summary.update(detected_format="chatgpt_conversations_json", conversations=convs, exchanges=rows)

        check = timed(summary, "validate", lambda: subprocess.run(
            [sys.executable, str(JOBS_DIR / "lib" / "validate_prompts.py"), str(prompts)],
            capture_output=True, text=True,
        ))
        # The validator prints counts and line numbers only, so its output is safe to keep.
        summary["validator"] = {"exit_code": check.returncode, "output": check.stdout.splitlines()}
        if check.returncode != 0:
            raise RuntimeError("validator failed")

        insights = timed(summary, "analyze", lambda: analyze.main(prompts, OUTPUT / "insights.json"))
        summary["stats"] = insights["stats"]
        summary["ok"] = True
    except Exception as e:
        summary["error"] = f"{type(e).__name__}: {e}"
        log("failed", error=summary["error"])
    (OUTPUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    log("finished", ok=summary["ok"])
    return 0 if summary["ok"] else 1


def main_droid():
    """The real jobs, the way the backend will run them: the Droid Ingestor, then the Droid Analyst.

    Each job script runs our own checks and exits non-zero if they fail, so a failed ingest stops here.
    Old logs and transcripts for both jobs are removed first, so they describe this run only.
    """
    for job in ("ingest", "analyze"):
        for suffix in (".jsonl", ".transcript.jsonl"):
            (LOGS / f"{job}{suffix}").unlink(missing_ok=True)
    for step in ("ingest.py", "analyze.py"):
        print(f"\n######## {step} ########", flush=True)
        code = subprocess.run([sys.executable, str(JOBS_DIR / step)]).returncode
        if code != 0:
            print(f"\n{step} failed (exit {code}); stopping.")
            return code
    return 0


if __name__ == "__main__":
    # Default: the stand-ins (what the Daytona sandbox runs until droid can reach Factory from there).
    sys.exit(main_droid() if "--droid" in sys.argv[1:] else main())
