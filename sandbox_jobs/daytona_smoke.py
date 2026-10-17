"""D0: Daytona smoke test. Create a sandbox, run a command, round-trip a file, delete it."""

import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv

# The SDK reads DAYTONA_API_KEY from the environment; the key is never printed or put in code.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from daytona import Daytona  # noqa: E402


def step(name, start):
    print(f"[{name}] {time.perf_counter() - start:.2f}s")


def main():
    if os.environ.get("DAYTONA_API_KEY") is None:
        raise SystemExit("DAYTONA_API_KEY not loaded from .env")

    daytona = Daytona()
    sandbox = None
    try:
        t = time.perf_counter()
        sandbox = daytona.create()
        print(f"sandbox id: {sandbox.id}")
        print(f"created_at: {getattr(sandbox, 'created_at', None)}")
        step("create", t)

        t = time.perf_counter()
        resp = sandbox.process.exec("sh -c 'python3 --version && uname -a && whoami && echo $HOME'")
        print(f"exit code: {resp.exit_code}")
        print(resp.result.strip())
        step("exec", t)
        home = resp.result.strip().splitlines()[-1]

        t = time.perf_counter()
        payload = {"hello": "daytona", "numbers": [1, 2, 3]}
        sandbox.fs.upload_file(json.dumps(payload).encode(), f"{home}/in.json")
        step("upload", t)

        t = time.perf_counter()
        script = (
            "import json; d = json.load(open('in.json')); "
            "d['sum'] = sum(d['numbers']); json.dump(d, open('out.json', 'w'))"
        )
        resp = sandbox.process.exec(f'python3 -c "{script}"', cwd=home)
        print(f"exit code: {resp.exit_code} {resp.result.strip()}")
        step("transform", t)

        t = time.perf_counter()
        out = sandbox.fs.download_file(f"{home}/out.json")
        print(f"round-tripped: {out.decode()}")
        step("download", t)
    finally:
        if sandbox is not None:
            t = time.perf_counter()
            daytona.delete(sandbox)
            print(f"deleted sandbox {sandbox.id}")
            step("delete", t)


if __name__ == "__main__":
    main()
