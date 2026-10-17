"""D3: run the per-user sandbox flow on the fake ChatGPT sample and print timings and top tips."""

import asyncio
import sys
import uuid
from pathlib import Path

from dotenv import load_dotenv

REPO = Path(__file__).resolve().parents[1]
# The SDK reads DAYTONA_API_KEY from the environment; keys are never printed or put in code.
load_dotenv(REPO / ".env")

from sandbox import run_user_jobs  # noqa: E402

SAMPLE = REPO / "sandbox_jobs" / "samples" / "chatgpt_fake" / "conversations.json"


async def main():
    export_bytes = SAMPLE.read_bytes()  # into memory; run_user_jobs never writes it to disk
    job_id = uuid.uuid4().hex[:12]
    result = await run_user_jobs(export_bytes, SAMPLE.name, job_id, on_log=lambda m: print(f"[{job_id}] {m}"))

    print(f"\nsandbox: {result['sandbox_id']}  ok: {result['ok']}")
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
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
