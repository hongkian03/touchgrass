"""D3/D5: run the per-user sandbox flow on the fake ChatGPT sample.

Prints each log line as it streams in (with seconds since start), then timings and the top tips.

Options:
  --delay N     make each stand-in step sleep N seconds, so streaming is visible
  --timeout N   overall job timeout in seconds (default 600), e.g. 20 to force a timeout
  --marker      put SECRETWORD123 into the export (in memory) and check nothing that came back contains it
"""

import argparse
import asyncio
import json
import os
import sys
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv

REPO = Path(__file__).resolve().parents[1]
# The SDK reads DAYTONA_API_KEY from the environment; keys are never printed or put in code.
load_dotenv(REPO / ".env")

from sandbox import JOB_TIMEOUT, run_user_jobs  # noqa: E402

SAMPLE = REPO / "sandbox_jobs" / "samples" / "chatgpt_fake" / "conversations.json"
MARKER = "SECRETWORD123"


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--delay", type=float, default=0)
    ap.add_argument("--timeout", type=int, default=JOB_TIMEOUT)
    ap.add_argument("--marker", action="store_true")
    args = ap.parse_args()
    if args.delay:
        os.environ["STANDIN_DELAY"] = str(args.delay)

    export_bytes = SAMPLE.read_bytes()  # into memory; run_user_jobs never writes it to disk
    if args.marker:
        export_bytes = export_bytes.replace(b"Crumb & Co", f"{MARKER} Crumb & Co".encode())
        assert MARKER.encode() in export_bytes

    job_id = uuid.uuid4().hex[:12]
    start = time.perf_counter()
    streamed = []

    def on_log(entry):
        streamed.append(entry)
        detail = {k: v for k, v in entry.items() if k not in ("source", "ts", "event")}
        print(f"+{time.perf_counter() - start:6.2f}s  {entry['source']:<7} {entry.get('event')}  {detail or ''}")

    result = await run_user_jobs(export_bytes, SAMPLE.name, job_id, on_log=on_log, job_timeout=args.timeout)

    print(f"\nsandbox: {result['sandbox_id']}  ok: {result['ok']}  timed out: {result.get('timed_out')}")
    if result.get("error"):
        print(f"error: {result['error']}")
    print("timings (s):")
    for step, seconds in result["timings"].items():
        print(f"  {step:<14}{seconds:>7.2f}")
    print(f"  {'total':<14}{sum(result['timings'].values()):>7.2f}")

    summary = result.get("summary") or {}
    print(f"\nin-sandbox job timings (s): {summary.get('timings')}")
    print(f"stats: {summary.get('stats')}")
    print("\ntop 3 tips:")
    for tip in ((result.get("insights") or {}).get("tips") or [])[:3]:
        print(f"  - {tip['title']}")
    print("\nuploaded:", result["audit"]["uploaded"])
    print("downloaded:", result["audit"]["downloaded"])

    if args.marker:
        returned = json.dumps({"streamed": streamed, "result": result}, default=str)
        print(f"\nmarker {MARKER} in anything returned: {MARKER in returned}")
        if MARKER in returned:
            return 1
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
