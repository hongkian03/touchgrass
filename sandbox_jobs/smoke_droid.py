"""F0: Python smoke test for the Droid SDK. Asks Droid to reply with exactly OK.

FACTORY_API_KEY is loaded from the repo-root .env (never printed or put in code). The SDK
needs the droid CLI on PATH.
"""

import asyncio
import os
import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from droid_sdk import (  # noqa: E402
    DroidConnectionError,
    DroidError,
    DroidProcessError,
    RunTimeoutError,
    run,
)


async def main():
    if not os.environ.get("FACTORY_API_KEY"):
        print("FAIL: FACTORY_API_KEY is not set. Add it to the repo-root .env.")
        return 1
    if shutil.which("droid") is None:
        print("FAIL: droid is not on PATH. Install the CLI, then open a new terminal.")
        return 1

    try:
        result = await run("Reply with exactly: OK", timeout=60)
    except RunTimeoutError:
        print("FAIL: Droid did not answer within 60 seconds.")
        return 1
    except DroidConnectionError as e:
        print(f"FAIL: could not start or reach droid (is it on PATH? `where.exe droid`): {e}")
        return 1
    except DroidProcessError as e:
        print(f"FAIL: the droid process exited with an error (check the API key): {e}")
        return 1
    except DroidError as e:
        print(f"FAIL: {type(e).__name__}: {e}")
        return 1

    print(f"success: {result.success}")
    print(f"subtype: {result.subtype}")
    print(f"text: {result.text}")
    if result.usage is not None:
        print(f"factory_credits: {result.usage.factory_credits}")
    if not result.success:
        print(f"error: {result.error}")
    return 0 if result.success and (result.text or "").strip() == "OK" else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
