"""F2: Droid Job 1, the Ingestor.

Droid inspects the chat export in WORK_DIR/input, writes WORK_DIR/droid/parser.py to turn it into
WORK_DIR/output/prompts.jsonl, tests it, and fixes it until our validator passes. Afterwards we run
the validator ourselves and only report success if it passes, whatever Droid claimed.

Usage: py sandbox_jobs/ingest.py   (exactly one export in WORK_DIR/input; FACTORY_API_KEY in .env)
"""

import asyncio
import os
import shutil
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from droid_runner import WORK_DIR, ensure_work_dirs, run_droid_job  # noqa: E402

LIB_SRC = Path(__file__).resolve().parent / "lib"
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
3. If the user regenerated an answer, each version is a separate exchange, and every version after
   the first has regenerated=true. In ChatGPT exports, conversations are trees: regenerated answers
   are sibling branches under the same user message, so follow every branch, not just one path.
   An exchange where the assistant generated an image has kind "image".
4. Write test_parser.py with tests for parser.py, run it, and fix parser.py until it passes.
5. Run `{PYTHON} ../lib/validate_prompts.py ../output/prompts.jsonl` and fix parser.py until it exits 0.
6. Reply with the summary fields: detected_format, exchanges, models, regenerations, images, notes.

Don't ask questions; nobody is there to answer. Decide from these instructions.
"""


def copy_lib():
    for name in ("schema.json", "validate_prompts.py"):
        shutil.copy2(LIB_SRC / name, WORK_DIR / "lib" / name)


def validate():
    proc = subprocess.run(
        [sys.executable, str(WORK_DIR / "lib" / "validate_prompts.py"), str(WORK_DIR / "output" / "prompts.jsonl")],
        capture_output=True, text=True,
    )
    return proc.returncode == 0, proc.stdout


async def main():
    ensure_work_dirs()
    exports = [p for p in (WORK_DIR / "input").iterdir() if p.is_file()]
    if len(exports) != 1:
        print(f"expected exactly 1 export in {WORK_DIR / 'input'}, found {len(exports)}")
        return 1
    copy_lib()
    (WORK_DIR / "output" / "prompts.jsonl").unlink(missing_ok=True)

    job = await run_droid_job("ingest", PROMPT, output_model=IngestSummary, timeout=900)

    print(f"\nDroid: success={job.success} subtype={job.subtype} seconds={job.duration} "
          f"factory_credits={job.factory_credits}")
    if job.error:
        print(f"error: {job.error}")
    if job.rejected:
        print(f"rejected actions: {job.rejected}")
    print(f"Droid's summary: {job.structured}")

    passed, report = validate()
    print("\nOur validator (run by ingest.py, not Droid):")
    print(report.rstrip())
    ok = job.success and passed
    print(f"\nINGEST {'PASSED' if ok else 'FAILED'}" + ("" if passed else " (our validator did not pass)"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
