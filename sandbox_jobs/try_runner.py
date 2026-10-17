"""F1: try the Droid job runner.

Test 1: Droid writes droid/hello.py, which writes output/hello.json = {"ok": true}, and runs it.
Test 2: Droid is asked to write into lib/; the permission handler must reject it.

FACTORY_API_KEY is loaded from the repo-root .env. The droid CLI must be on PATH.
"""

import asyncio
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from droid_runner import WORK_DIR, ensure_work_dirs, run_droid_job  # noqa: E402

HELLO_PROMPT = (
    "Create a Python script named hello.py in the current directory. When run, it must write the file "
    "../output/hello.json containing exactly {\"ok\": true}. Then run it with: python hello.py\n"
    "Writing ../output/hello.json is expected and allowed. Don't ask questions; just do it."
)
BLOCKED_PROMPT = (
    "Use your file creation tool to create the file ../lib/blocked.txt containing the word hi. "
    "If that is refused, do not try any other way to write it. Just reply that it was refused."
)


def show(name, job):
    print(f"\n== {name}: success={job.success} subtype={job.subtype} seconds={job.duration} "
          f"factory_credits={job.factory_credits}")
    print(f"   text: {job.text!r}")
    print(f"   rejected: {job.rejected}")
    if job.error:
        print(f"   error: {job.error}")
    print(f"   log: {job.log_path}")


async def main():
    ensure_work_dirs()
    hello_json = WORK_DIR / "output" / "hello.json"
    blocked = WORK_DIR / "lib" / "blocked.txt"
    for stale in (hello_json, blocked, WORK_DIR / "logs" / "hello.jsonl", WORK_DIR / "logs" / "blocked.jsonl"):
        stale.unlink(missing_ok=True)

    hello = await run_droid_job("hello", HELLO_PROMPT, timeout=180)
    show("test 1: hello", hello)
    try:
        hello_ok = json.loads(hello_json.read_text(encoding="utf-8")) == {"ok": True}
    except (OSError, json.JSONDecodeError):
        hello_ok = False
    print(f"   output/hello.json == {{\"ok\": true}}: {hello_ok}")

    lib_before = sorted(p.name for p in (WORK_DIR / "lib").iterdir())
    blocked_job = await run_droid_job("blocked", BLOCKED_PROMPT, timeout=180)
    show("test 2: write into lib/", blocked_job)
    lib_after = sorted(p.name for p in (WORK_DIR / "lib").iterdir())
    lib_ok = not blocked.exists() and lib_before == lib_after and bool(blocked_job.rejected)
    print(f"   lib/ unchanged and a rejection was logged: {lib_ok}")

    credits = sum(j.factory_credits or 0 for j in (hello, blocked_job))
    print(f"\ntotal factory_credits: {credits}")
    passed = hello.success and hello_ok and lib_ok
    print("PASS" if passed else "FAIL")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
