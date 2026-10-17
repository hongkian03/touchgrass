"""Entry point inside the sandbox: Job 1 (ingest), our validator, then Job 2 (analyze).

For now Jobs 1 and 2 are the hand-written stand-ins in standin/; the Droid jobs replace them
once droid can run in the sandbox. Everything reads WORK_DIR from the environment.

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


if __name__ == "__main__":
    sys.exit(main())
