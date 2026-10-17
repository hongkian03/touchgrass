"""D2: build the dependency snapshot. Dependencies only; job code is uploaded fresh each run.

v0 has no droid CLI: Factory's domains (app/api/downloads.factory.ai) are blocked on our Daytona tier.
Once they're reachable, add the installer and copy the binary into /usr/local/bin, then bump to v1.
No API keys go into the image; they arrive only through env_vars at sandbox creation.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# The SDK reads DAYTONA_API_KEY from the environment; the key is never printed or put in code.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from daytona import CreateSnapshotParams, Daytona, Image  # noqa: E402

SNAPSHOT_NAME = "promptprint-deps-v0"  # bump when dependencies change
WORK_SUBDIRS = ["input", "lib", "droid", "output", "logs"]

image = (
    Image.debian_slim("3.12")
    .run_commands(
        "apt-get update && apt-get install -y --no-install-recommends curl ca-certificates git"
        " && rm -rf /var/lib/apt/lists/*",
        # World-writable so whichever user the sandbox runs as can write job files.
        "mkdir -p " + " ".join(f"/work/{d}" for d in WORK_SUBDIRS) + " && chmod -R a+rwX /work",
    )
    .pip_install("droid-sdk", "pandas", "jsonschema", "beautifulsoup4", "tiktoken", "python-dotenv")
    .env({"WORK_DIR": "/work"})
)


def main():
    if os.environ.get("DAYTONA_API_KEY") is None:
        raise SystemExit("DAYTONA_API_KEY not loaded from .env")

    daytona = Daytona()
    try:
        existing = daytona.snapshot.get(SNAPSHOT_NAME)
    except Exception:
        existing = None
    if existing is not None:
        raise SystemExit(f"snapshot {SNAPSHOT_NAME} already exists (state: {existing.state}); bump the version")

    print(f"building {SNAPSHOT_NAME}")
    snapshot = daytona.snapshot.create(CreateSnapshotParams(name=SNAPSHOT_NAME, image=image), on_logs=print)
    print(f"built {snapshot.name} (state: {snapshot.state})")


if __name__ == "__main__":
    sys.exit(main())
