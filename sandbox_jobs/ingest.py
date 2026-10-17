"""F2/F3: Droid Job 1, the Ingestor, with a parser cache and an Eval 2 mode.

Privacy: Droid never sees the user's text. It works in DROID_VIEW_DIR/ingest, which holds only a redacted
copy of the export (lib/redact.py: same structure, text replaced by "<text N chars>"), with
Droid's default tools. There it writes parser.py, tests it, and fixes it until our
validator passes on the redacted output. Then we copy parser.py into WORK_DIR and run it on the
real export ourselves, without Droid, and only report success if our validator passes on the real
output and its counts match the redacted run.

Cache: the export's structure fingerprint (lib/fingerprint.py, no values) keys a cache of
Droid-written parsers. On a hit we run the cached parser.py and our validator, and skip Droid if
it passes. After a successful Droid run, parser.py (not the tests, which may hold sample text) is
saved to PARSER_CACHE/<fingerprint>/.

Usage:
  py sandbox_jobs/ingest.py                         # the one export already in WORK_DIR/input
  py sandbox_jobs/ingest.py --input FILE            # copy FILE into a clean WORK_DIR/input first
  py sandbox_jobs/ingest.py --input FILE --no-cache --repeat 3
      Eval 2 mode: run the Ingestor 3 times from a clean WORK_DIR, never reading the cache,
      and write evals/eval2_runs.csv with one row per run.
"""

import argparse
import asyncio
import csv
import json
import os
import shutil
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel

REPO = Path(__file__).resolve().parents[1]
load_dotenv(REPO / ".env")

from droid_runner import (  # noqa: E402
    DROID_VIEW_DIR,
    WORK_DIR,
    ensure_work_dirs,
    run_droid_job,
)

VIEW = DROID_VIEW_DIR / "ingest"  # the only folder Droid works in for this job

LIB_SRC = Path(__file__).resolve().parent / "lib"
sys.path.insert(0, str(LIB_SRC))
from fingerprint import fingerprint  # noqa: E402
from redact import redact_file  # noqa: E402

PARSER_CACHE = Path(os.environ.get("PARSER_CACHE", REPO / "parser_cache"))
EVAL2_CSV = REPO / "evals" / "eval2_runs.csv"
EVAL2_COLUMNS = ["run", "success", "attempts", "first_try", "exchanges", "regenerations", "images",
                 "duration", "credits", "input"]
CACHED_PARSER_TIMEOUT = 300
# The command Droid uses to run Python: py on Windows laptops (python is often the Store stub),
# python3 inside the Linux sandbox.
PYTHON = os.environ.get("DROID_PYTHON", "py" if os.name == "nt" else "python3")


class IngestSummary(BaseModel):
    detected_format: str
    exchanges: int
    models: list[str]
    regenerations: int
    images: int
    notes: str


PROMPT = f"""You are the Ingestor. Turn a user's AI chat export into our fixed schema.

Folders (relative to your current directory, which is the droid folder):
- ../input/ holds the export. Read only; never modify it.
- ../lib/ holds schema.json and validate_prompts.py. Read only; never modify them.
- . (this folder) is where you write your code.
- ../output/ is where your parser writes its result.

The export is a REDACTED copy of the user's real export, for privacy. It has exactly the real
structure (same keys, nesting, list lengths and value types), but every text value has been
replaced by a placeholder like "<text 42 chars>". Kept as-is: numbers, booleans, nulls, keys,
timestamps, empty strings, and fields whose values are all short single tokens (roles such as
"user", content types, model names, IDs that link messages). Your parser.py will later run on the
real export, where the placeholders are the real text, so it must never depend on the content of
text fields (never match on placeholder text or on words inside messages), only on structure and
on the kept token fields.

Only look at files inside this job's folders: ../input, ../lib, this folder and ../output. Never
open, list or search any other path on this machine. You may use LS, Glob, Read and Grep there,
or write small scripts that print keys, types and counts. Create and change files with your file
tools (Create, Edit or ApplyPatch); never create or write files with shell commands such as
Set-Content, echo or python -c.
You are already in the droid folder, so don't cd anywhere. Run Python with `{PYTHON}` (for example
`{PYTHON} parser.py`). Only run Python scripts that are in this folder or ../lib, or
`{PYTHON} -m pytest` on tests in this folder, one command at a time with no pipes or redirects.
Other commands will be refused, and a refused command ends your turn.

Steps:
1. Inspect the export by writing small scripts in this folder that print its structure: top-level
   type, keys, counts, and one or two short samples, truncated. Never print or read the whole file
   into the conversation. It can be huge and holds private text.
2. Write parser.py. It reads the export from ../input and writes ../output/prompts.jsonl: one JSON
   object per line, one line per exchange (a user prompt and the assistant's reply), matching
   ../lib/schema.json exactly: ts (ISO 8601 string), provider (string), model (string or null),
   kind ("text", "image" or "video"), prompt_text, response_text, regenerated (bool). No other fields.
   parser.py will be reused on other exports with the same structure, so it must find the export
   by listing ../input (there is exactly one file) rather than hard-coding its name, and must not
   depend on anything specific to this file's contents.
   provider is the service in lowercase (for example chatgpt or claude). If the export doesn't say,
   infer it from the format or the model names, or use "unknown". Use null for model if unknown.
3. If the user regenerated an answer, each version is a separate exchange, and every version after
   the first has regenerated=true. In ChatGPT exports, conversations are trees: regenerated answers
   are sibling branches under the same user message, so follow every branch, not just one path.
   An exchange where the assistant generated an image has kind "image".
4. Write test_parser.py with tests for parser.py, run it, and fix parser.py until it passes.
5. Run `{PYTHON} ../lib/validate_prompts.py ../output/prompts.jsonl` and fix parser.py until it exits 0.
6. Reply with the summary fields: detected_format, exchanges, models, regenerations, images, notes.

Don't ask questions; nobody is there to answer. Decide from these instructions.
"""


def copy_lib(root=WORK_DIR, names=("schema.json", "validate_prompts.py", "fingerprint.py", "redact.py")):
    for name in names:
        shutil.copy2(LIB_SRC / name, root / "lib" / name)


def clear(folder):
    for p in folder.iterdir():
        shutil.rmtree(p) if p.is_dir() else p.unlink()


def validate(root=WORK_DIR):
    proc = subprocess.run(
        [sys.executable, str(root / "lib" / "validate_prompts.py"), str(root / "output" / "prompts.jsonl")],
        capture_output=True, text=True,
    )
    return proc.returncode == 0, proc.stdout


def counts(prompts):
    rows = [json.loads(line) for line in prompts.read_text(encoding="utf-8").splitlines() if line.strip()]
    return {"exchanges": len(rows), "regenerations": sum(r["regenerated"] for r in rows),
            "images": sum(r["kind"] == "image" for r in rows)}


def run_parser_on_real():
    """Run WORK_DIR/droid/parser.py on the real export, without Droid. Returns (ok, why)."""
    try:
        proc = subprocess.run([sys.executable, "parser.py"], cwd=WORK_DIR / "droid",
                              capture_output=True, text=True, timeout=CACHED_PARSER_TIMEOUT)
    except subprocess.TimeoutExpired:
        return False, "parser timed out"
    if proc.returncode != 0:
        return False, f"parser exited {proc.returncode}"
    return True, "ran"


def build_droid_view(export):
    """A fresh Droid view holding only the redacted export and our schema and validator."""
    ensure_work_dirs(VIEW)
    for name in ("input", "lib", "droid", "output"):
        clear(VIEW / name)
    stats = redact_file(export, VIEW / "input" / f"export{export.suffix.lower()}")
    copy_lib(VIEW, ("schema.json", "validate_prompts.py"))
    print(f"redacted copy for Droid: replaced {stats['replaced']} strings, kept {stats['kept']} "
          f"(fields kept: {len(stats['kept_fields'])})")
    return stats


def normalize_and_count(prompts):
    """Lowercase provider (Droid's parsers spell it differently), then count from our own output."""
    rows = [json.loads(line) for line in prompts.read_text(encoding="utf-8").splitlines() if line.strip()]
    for row in rows:
        row["provider"] = row["provider"].lower()
    prompts.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    return {
        "exchanges": len(rows),
        "regenerations": sum(r["regenerated"] for r in rows),
        "images": sum(r["kind"] == "image" for r in rows),
        "models": dict(Counter(r["model"] or "(unknown)" for r in rows)),
        "providers": sorted({r["provider"] for r in rows}),
    }


def count_attempts(log_path):
    """How many times Droid ran its tests and our validator in the latest ingest run."""
    lines = [json.loads(line) for line in log_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    starts = [i for i, line in enumerate(lines) if line["type"] == "job_start"]
    calls = [line for line in lines[starts[-1] if starts else 0:]
             if line["type"] == "tool_call" and line.get("tool") == "Execute"]
    test_runs = sum("test_parser" in c.get("target", "") or "pytest" in c.get("target", "") for c in calls)
    validator_runs = sum("validate_prompts" in c.get("target", "") for c in calls)
    # One attempt = one round of checking; Droid may run tests and the validator once each per round.
    attempts = max(test_runs, validator_runs)
    return {"attempts": attempts, "first_try": attempts == 1, "test_runs": test_runs, "validator_runs": validator_runs}


def try_cache(fp):
    cached = PARSER_CACHE / fp / "parser.py"
    if not cached.is_file():
        return False, "no cached parser"
    clear(WORK_DIR / "droid")
    shutil.copy2(cached, WORK_DIR / "droid" / "parser.py")
    ran, why = run_parser_on_real()
    if not ran:
        return False, f"cached {why}"
    passed, _ = validate()
    return passed, "validator passed" if passed else "validator failed on cached parser output"


async def ingest_once(no_cache=False):
    ensure_work_dirs()
    exports = [p for p in (WORK_DIR / "input").iterdir() if p.is_file()]
    if len(exports) != 1:
        raise SystemExit(f"expected exactly 1 export in {WORK_DIR / 'input'}, found {len(exports)}")
    copy_lib()
    prompts = WORK_DIR / "output" / "prompts.jsonl"
    prompts.unlink(missing_ok=True)
    fp = fingerprint(exports[0])
    result = {"fingerprint": fp, "cache_hit": False, "attempts": 0, "first_try": False, "credits": 0.0}
    start = time.monotonic()
    print(f"fingerprint: {fp}")

    if not no_cache:
        hit, why = try_cache(fp)
        print(f"cache: {'hit' if hit else 'miss'} ({why})")
        if hit:
            result.update(cache_hit=True, success=True, **normalize_and_count(prompts))
            result["duration"] = round(time.monotonic() - start, 2)
            return result
        prompts.unlink(missing_ok=True)

    clear(WORK_DIR / "droid")
    build_droid_view(exports[0])
    job = await run_droid_job("ingest", PROMPT, output_model=IngestSummary, timeout=900,
                              work_dir=VIEW)
    print(f"\nDroid: success={job.success} subtype={job.subtype} seconds={job.duration} "
          f"factory_credits={job.factory_credits}")
    if job.error:
        print(f"error: {job.error}")
    if job.rejected:
        print(f"rejected actions: {job.rejected}")
    print(f"Droid's summary: {job.structured}")
    result.update(credits=job.factory_credits or 0.0, droid_error=job.error, **count_attempts(job.log_path))

    view_prompts = VIEW / "output" / "prompts.jsonl"
    view_passed, _ = validate(VIEW) if view_prompts.exists() else (False, "")
    print(f"\nOur validator on Droid's redacted output: {'PASS' if view_passed else 'FAIL'}")

    # Now the real export, without Droid: our copy of its parser, our validator.
    droid_parser = VIEW / "droid" / "parser.py"
    passed, report, why = False, "", "no parser.py from Droid"
    # Our checks decide, not how Droid's turn ended: a turn can end in a connection error after the
    # parser is written and passing. A changed protected folder always fails.
    if not job.tampered and view_passed and droid_parser.is_file():
        shutil.copy2(droid_parser, WORK_DIR / "droid" / "parser.py")
        ran, why = run_parser_on_real()
        if ran and prompts.exists():
            passed, report = validate()
    print("\nOur validator on the real export (parser run by ingest.py, not Droid):")
    print(report.rstrip() or f"not run ({why})")
    same = passed and counts(prompts) == counts(view_prompts)
    if passed and not same:
        print(f"counts differ: real {counts(prompts)} vs redacted {counts(view_prompts)}")
    result["success"] = not job.tampered and view_passed and passed and same
    if result["success"] and not job.success:
        print(f"note: Droid's turn ended as {job.subtype}, but the parser it wrote passes our checks")
    if result["success"]:
        result.update(normalize_and_count(prompts))
        parser = WORK_DIR / "droid" / "parser.py"
        if parser.is_file():
            (PARSER_CACHE / fp).mkdir(parents=True, exist_ok=True)
            shutil.copy2(parser, PARSER_CACHE / fp / "parser.py")
            print(f"cached parser: {PARSER_CACHE / fp / 'parser.py'}")
    result["duration"] = round(time.monotonic() - start, 2)
    return result


def show(result):
    keys = ["success", "cache_hit", "fingerprint", "attempts", "first_try", "exchanges", "regenerations",
            "images", "models", "providers", "duration", "credits"]
    print("\nINGEST " + ("PASSED" if result.get("success") else "FAILED"))
    print(json.dumps({k: result.get(k) for k in keys}, indent=1))


def reset_work(input_file):
    ensure_work_dirs()
    for name in ("input", "droid", "output"):
        clear(WORK_DIR / name)
    (WORK_DIR / "logs" / "ingest.jsonl").unlink(missing_ok=True)
    shutil.copy2(input_file, WORK_DIR / "input" / input_file.name)


async def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", type=Path, help="export to copy into a clean WORK_DIR/input")
    ap.add_argument("--no-cache", action="store_true", help="never use a cached parser")
    ap.add_argument("--repeat", type=int, help="Eval 2 mode: run N times and write evals/eval2_runs.csv")
    args = ap.parse_args()

    if args.repeat:
        if not args.input:
            raise SystemExit("--repeat needs --input")
        EVAL2_CSV.parent.mkdir(parents=True, exist_ok=True)
        with EVAL2_CSV.open("w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(EVAL2_COLUMNS)
        results = []
        for run in range(1, args.repeat + 1):
            print(f"\n===== Eval 2 run {run}/{args.repeat} =====")
            reset_work(args.input)
            result = await ingest_once(no_cache=args.no_cache)
            show(result)
            results.append(result)
            with EVAL2_CSV.open("a", newline="", encoding="utf-8") as f:  # row by row, so partial runs survive
                csv.writer(f).writerow([run, result.get("success"), result.get("attempts"), result.get("first_try"),
                                        result.get("exchanges"), result.get("regenerations"), result.get("images"),
                                        result.get("duration"), result.get("credits"), args.input.name])
        print(f"\nwrote {EVAL2_CSV}")
        return 0 if all(r.get("success") for r in results) else 1

    if args.input:
        reset_work(args.input)
    result = await ingest_once(no_cache=args.no_cache)
    show(result)
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
