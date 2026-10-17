"""Start PromptPrint's backend: the API that triggers every Droid job, in the mode the environment picks.

    py start.py                 Daytona mode if DAYTONA_API_KEY is set (in .env or the environment),
                                local mode if it isn't
    py start.py --replay        demo fallback: replay saved runs instead of calling Droid
    py start.py --local         force local mode (no sandboxes)
    py start.py --port 8001

Loads the repo-root .env (keys are never printed). In Daytona mode it first deletes any of our
sandboxes left over from a crashed run (backend/cleanup_sandboxes.py: label app=promptprint, older
than 60 minutes). The backend logs the active mode at startup. The Chrome extension is loaded into
Chrome separately (see extension/).
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

import uvicorn
from dotenv import load_dotenv

REPO = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--replay", action="store_true", help="same as DEMO_REPLAY=1")
    ap.add_argument("--local", action="store_true", help="same as EXECUTOR=local")
    ap.add_argument("--no-sweep", action="store_true", help="skip deleting leftover sandboxes")
    args = ap.parse_args()

    load_dotenv(REPO / ".env")
    if args.replay:
        os.environ["DEMO_REPLAY"] = "1"
    if args.local:
        os.environ["EXECUTOR"] = "local"
    sys.path.insert(0, str(REPO))
    from backend.executor import sandbox_mode

    if sandbox_mode()[0] == "daytona" and not args.replay and not args.no_sweep:
        subprocess.run([sys.executable, str(REPO / "backend" / "cleanup_sandboxes.py")], cwd=REPO, check=False)
    uvicorn.run("backend.main:app", host=args.host, port=args.port)


if __name__ == "__main__":
    main()
