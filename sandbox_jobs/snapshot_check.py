"""D2: create a sandbox from the dependency snapshot and check it's ready with no installs.

The droid --version check is skipped until the snapshot includes the droid CLI (see build_snapshot.py).
FACTORY_API_KEY is passed through env_vars only if it's set in .env.
"""

import os
import shlex
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# The SDK reads DAYTONA_API_KEY from the environment; keys are never printed or put in code.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from daytona import CreateSandboxFromSnapshotParams, Daytona  # noqa: E402

from build_snapshot import SNAPSHOT_NAME  # noqa: E402

CHECKS = [
    ("python", "python --version"),
    ("imports", "python -c 'import pandas, droid_sdk, bs4, jsonschema, tiktoken, dotenv; print(\"imports ok\")'"),
    ("work dir", "whoami && echo WORK_DIR=$WORK_DIR && ls -la /work"),
    ("work writable", "touch /work/output/.probe && rm /work/output/.probe && echo writable"),
]


def main():
    if os.environ.get("DAYTONA_API_KEY") is None:
        raise SystemExit("DAYTONA_API_KEY not loaded from .env")

    env_vars = {}
    if os.environ.get("FACTORY_API_KEY"):
        env_vars["FACTORY_API_KEY"] = os.environ["FACTORY_API_KEY"]

    daytona = Daytona()
    sandbox = None
    ok = True
    try:
        t = time.perf_counter()
        sandbox = daytona.create(CreateSandboxFromSnapshotParams(snapshot=SNAPSHOT_NAME, env_vars=env_vars))
        print(f"sandbox id: {sandbox.id} from {SNAPSHOT_NAME}")
        print(f"created in {time.perf_counter() - t:.2f}s")

        for label, command in CHECKS:
            resp = sandbox.process.exec(f"sh -c {shlex.quote(command)}", timeout=60)
            print(f"\n--- {label} (exit {resp.exit_code})\n{resp.result.strip()}")
            ok &= resp.exit_code == 0
        print("\nPASS" if ok else "\nFAIL")
    finally:
        if sandbox is not None:
            daytona.delete(sandbox)
            print(f"deleted sandbox {sandbox.id}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
