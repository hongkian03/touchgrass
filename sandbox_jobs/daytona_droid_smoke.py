"""D1 (steps a to c): check network, install the droid CLI, and run droid --version in a sandbox.

Steps d and e (droid exec and droid-sdk) need FACTORY_API_KEY and are not run yet.
"""

import os
import shlex
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# The SDK reads DAYTONA_API_KEY from the environment; the key is never printed or put in code.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from daytona import CreateSandboxFromSnapshotParams, Daytona  # noqa: E402

FACTORY_DOMAINS = ["app.factory.ai", "downloads.factory.ai", "api.factory.ai"]

FIND_DROID = (
    "for p in $HOME/.local/bin/droid $(command -v droid 2>/dev/null); do "
    '[ -x "$p" ] && echo "$p" && exit 0; done; '
    "ls -la $HOME/.local/bin 2>&1; "
    "find / -name droid -type f 2>/dev/null | head; exit 1"
)


def run(sandbox, label, command, timeout=300):
    print(f"\n--- step {label}: {command}")
    t = time.perf_counter()
    resp = sandbox.process.exec(f"sh -c {shlex.quote(command)}", timeout=timeout)
    print(f"exit code: {resp.exit_code} ({time.perf_counter() - t:.2f}s)")
    print(resp.result.strip())
    if resp.exit_code != 0:
        print(f"\nFAILED at step {label}")
        return None
    return resp.result.strip()


def probe_domains(sandbox):
    # Informational only: shows which Factory domains are reachable, without stopping the run.
    for domain in FACTORY_DOMAINS:
        cmd = f"curl -sS -o /dev/null -w 'http %{{http_code}}' --max-time 15 https://{domain}/ 2>&1; echo \" (curl exit $?)\""
        resp = sandbox.process.exec(f"sh -c {shlex.quote(cmd)}", timeout=30)
        print(f"probe {domain}: {resp.result.strip()}")


def steps(sandbox):
    probe_domains(sandbox)
    if run(sandbox, "a", "curl -sI https://app.factory.ai") is None:
        return False
    if run(sandbox, "b", "curl -fsSL https://app.factory.ai/cli | sh") is None:
        return False
    found = run(sandbox, "c (find)", FIND_DROID)
    if found is None:
        return False
    droid = found.splitlines()[-1]
    print(f"droid binary: {droid}")
    return run(sandbox, "c (version)", f"{shlex.quote(droid)} --version") is not None


def main():
    if os.environ.get("DAYTONA_API_KEY") is None:
        raise SystemExit("DAYTONA_API_KEY not loaded from .env")

    daytona = Daytona()
    sandbox = None
    ok = False
    try:
        t = time.perf_counter()
        sandbox = daytona.create(
            CreateSandboxFromSnapshotParams(language="python", domain_allow_list=",".join(FACTORY_DOMAINS))
        )
        print(f"sandbox id: {sandbox.id} (created in {time.perf_counter() - t:.2f}s)")

        t = time.perf_counter()
        ok = steps(sandbox)
        print(f"\nsteps a to c: {'passed' if ok else 'failed'} in {time.perf_counter() - t:.2f}s")
    finally:
        if sandbox is not None:
            daytona.delete(sandbox)
            print(f"deleted sandbox {sandbox.id}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
