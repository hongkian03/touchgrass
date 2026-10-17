"""D4 hybrid, inside the sandbox: run the parser.py and analyze.py Droid wrote on the real export.

Droid can't reach Factory from our Daytona tier, so it works on the backend with only a redacted
copy of this export (made in this sandbox by lib/redact.py) and fake prompts. The backend uploads
the two scripts it wrote into WORK_DIR/droid, and this runs them here, without Droid, with our checks:
  1. parser.py on the real export, then our validator on prompts.jsonl
  2. its counts (exchanges, regenerations, images) match the redacted run's (--expected)
  3. analyze.py on the real prompts.jsonl, then analyze.py's four checks: footprint.py unchanged,
     insights.json valid, a re-run gives identical output, no hard-coded footprint constants

Writes WORK_DIR/output/insights.json and WORK_DIR/output/summary.json (counts, check results,
timings and the export's structure fingerprint, never text). prompts.jsonl stays in the sandbox.
Prints one JSON log line per step. The scripts' own output is never kept, since it could hold chat text.

Usage: python3 run_real.py --expected '{"exchanges": 9, "regenerations": 1, "images": 1}'
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone

import analyze
import ingest
from droid_runner import WORK_DIR, ensure_work_dirs

MAX_FIELD = 200

# analyze.run_on_real returns the tail of stderr, which for a crash in Droid's script could quote
# real data. Keep only the part before it, here and in check_rerun, which calls it too.
_run_on_real = analyze.run_on_real
analyze.run_on_real = lambda: (lambda ok, why: (ok, why.split(":")[0]))(*_run_on_real())


def log(event, **fields):
    fields = {k: v[:MAX_FIELD] if isinstance(v, str) else v for k, v in fields.items()}
    line = {"ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"), "event": event, **fields}
    print(json.dumps(line), flush=True)


def timed(summary, name, fn):
    t = time.perf_counter()
    log(f"{name}_start")
    result = fn()
    summary["timings"][name] = round(time.perf_counter() - t, 3)
    log(f"{name}_done", seconds=summary["timings"][name])
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--expected", required=True, help="counts from the redacted run, as JSON")
    expected = json.loads(ap.parse_args().expected)
    ensure_work_dirs()
    summary = {"ok": False, "timings": {}}
    prompts = WORK_DIR / "output" / "prompts.jsonl"
    try:
        exports = [p for p in (WORK_DIR / "input").iterdir() if p.is_file()]
        if len(exports) != 1:
            raise RuntimeError(f"expected 1 file in input, found {len(exports)}")
        for name in ("parser.py", "analyze.py"):
            if not (WORK_DIR / "droid" / name).is_file():
                raise RuntimeError(f"droid/{name} missing")
        summary["fingerprint"] = ingest.fingerprint(exports[0])
        ingest.copy_lib()
        analyze.copy_lib()
        prompts.unlink(missing_ok=True)

        ran, why = timed(summary, "parse", ingest.run_parser_on_real)
        if not ran or not prompts.is_file():
            raise RuntimeError(f"parser.py on the real export: {why if not ran else 'no prompts.jsonl'}")
        passed, report = timed(summary, "validate", ingest.validate)
        # The validator prints counts and line numbers only, so its output is safe to keep.
        summary["validator"] = report.strip().splitlines()
        if not passed:
            raise RuntimeError("validator failed on the real prompts.jsonl")
        got = ingest.counts(prompts)
        summary["counts_match"] = got == expected
        if got != expected:
            raise RuntimeError(f"counts differ from the redacted run: real {got}, redacted {expected}")
        summary["ingest"] = ingest.normalize_and_count(prompts)

        ran, why = timed(summary, "analyze", analyze.run_on_real)
        if not ran:
            raise RuntimeError(f"analyze.py on the real data: {why}")
        results = timed(summary, "checks", lambda: analyze.checks(footprint_ok=True))
        summary["checks"] = {name: {"ok": ok, "detail": detail} for name, (ok, detail) in results.items()}
        for name, (ok, _) in results.items():
            log("check", name=name, ok=ok)
        summary["ok"] = all(ok for ok, _ in results.values())
    except Exception as e:
        summary["error"] = f"{type(e).__name__}: {e}"[:MAX_FIELD]
        log("failed", error=summary["error"])
    (WORK_DIR / "output" / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    log("finished", ok=summary["ok"])
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
