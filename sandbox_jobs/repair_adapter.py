"""F5: Droid Job 3, the Mechanic. Repairs a site adapter whose selectors stopped matching the page.

Copies the page snapshot, its expected.json and the broken adapter into the job's input folder and
our checker into its lib folder, then has Droid find the right elements and write a fixed adapter
with the version bumped by 1. Afterwards we run our checker ourselves, and only on a pass (with the
same keys and a version higher than both the broken one and anything already published) is the
adapter published: PUT to the backend's /adapters/{site} if it answers, otherwise
backend/adapters/<site>.json. Droid uses its default tools (the F2/F3 settings) and works in
WORK_DIR/mechanic, so other jobs' files in WORK_DIR are left alone. The snapshot must already be
cleaned (samples/clean_snapshot.py), since Droid reads it.

Usage: py sandbox_jobs/repair_adapter.py --site chatgpt --snapshot PAGE.html --adapter BROKEN.json
           [--failed prompt_box send_button] [--expected expected.json] [--no-publish]
"""

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

REPO = Path(__file__).resolve().parents[1]
load_dotenv(REPO / ".env")

from droid_runner import DROID_SAVED_DIR, WORK_DIR, ensure_work_dirs, run_droid_job, saved_droid_job  # noqa: E402

LIB_SRC = Path(__file__).resolve().parent / "lib"
JOB_DIR = WORK_DIR / "mechanic"
ADAPTERS_DIR = REPO / "backend" / "adapters"
BACKEND_URL = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000")
PYTHON = os.environ.get("DROID_PYTHON", "py" if os.name == "nt" else "python3")


def prompt(failed, keys):
    return f"""You are the Mechanic. A browser extension finds elements on a chat site's page with CSS
selectors stored in an adapter JSON. The site changed its page, and some selectors no longer match.

Folders (relative to your current directory, which is the droid folder):
- ../input/snapshot.html is a saved copy of the site's page. ../input/adapter.json is the broken
  adapter. ../input/expected.json says what the page holds: the prompt typed into the message box,
  and the model name if known. All three are read only; never modify them.
- ../lib/check_adapter.py is our checker. Read only; never modify it.
- . (this folder) is where you write your code. ../output/ is where you write the fixed adapter.

The selectors that failed: {', '.join(failed) if failed else 'unknown; run the checker to see'}.
The adapter's keys: {', '.join(keys)}.
- prompt_box: the message box, which must match exactly one element whose text contains the expected prompt
- send_button: the send button
- model_name: the model picker, which must match an element with non-empty text (equal to the expected model if given)
- response: the assistant's response messages

Steps:
1. Search the snapshot with small Python scripts in this folder that print what you need (tags and
   attributes of candidate elements, counts of matches). The file is large, so don't read the whole
   thing into the conversation.
2. Prefer stable attributes: id (only if it doesn't look generated), data-testid, aria-label, role,
   contenteditable, type, and data-* attributes that describe meaning. Avoid class names, which change
   often, and generated ids such as "radix-..." or ones full of random characters.
3. Write ../output/adapter.json: the same JSON as ../input/adapter.json with the same keys, the
   failed selectors fixed, any selector you didn't need to change left as it was, and "version"
   increased by exactly 1.
4. Run `{PYTHON} ../lib/check_adapter.py --adapter ../output/adapter.json --snapshot ../input/snapshot.html`
   and fix the adapter until it exits 0.

Run Python with `{PYTHON}`. Only run Python scripts in this folder or ../lib, one command at a time,
with no pipes or redirects; other commands will be refused, and a refused command ends your turn.
Create and change files with your file tools (Create, Edit or ApplyPatch), never with shell commands.
You are already in the droid folder, so don't cd anywhere. Don't ask questions; nobody is there to
answer. Reply with one line saying which selectors you changed.
"""


def clear(folder):
    for p in folder.iterdir():
        shutil.rmtree(p) if p.is_dir() else p.unlink()


def run_checker(adapter, snapshot, expected):
    proc = subprocess.run([sys.executable, str(JOB_DIR / "lib" / "check_adapter.py"), "--adapter", str(adapter),
                           "--snapshot", str(snapshot), "--expected", str(expected)], capture_output=True, text=True)
    return proc.returncode == 0, proc.stdout


def published_version(site):
    path = ADAPTERS_DIR / f"{site}.json"
    return json.loads(path.read_text(encoding="utf-8")).get("version", 0) if path.is_file() else 0


def publish(site, adapter):
    """PUT to the backend if it's running, else write backend/adapters/<site>.json."""
    body = json.dumps(adapter).encode()
    req = urllib.request.Request(f"{BACKEND_URL}/adapters/{site}", data=body, method="PUT",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            return f"PUT {BACKEND_URL}/adapters/{site} -> {resp.status}"
    except (urllib.error.URLError, OSError):
        ADAPTERS_DIR.mkdir(parents=True, exist_ok=True)
        path = ADAPTERS_DIR / f"{site}.json"
        path.write_text(json.dumps(adapter, indent=2) + "\n", encoding="utf-8")
        return f"backend not reachable; wrote {path.relative_to(REPO)}"


def show_diff(before, after):
    print("\nselectors, before -> after:")
    for key in before["selectors"]:
        old, new = before["selectors"][key], after.get("selectors", {}).get(key)
        mark = "  (unchanged)" if old == new else ""
        print(f"  {key}: {old}  ->  {new}{mark}")
    print(f"  version: {before.get('version')} -> {after.get('version')}")


async def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--site", required=True)
    ap.add_argument("--snapshot", required=True, type=Path)
    ap.add_argument("--adapter", required=True, type=Path, help="the broken adapter")
    ap.add_argument("--failed", nargs="*", default=[], help="selector keys that failed")
    ap.add_argument("--expected", type=Path, help="default: expected.json next to the snapshot")
    ap.add_argument("--no-publish", action="store_true", help="leave the fixed adapter in output/ only")
    args = ap.parse_args()
    expected = args.expected or args.snapshot.parent / "expected.json"
    start = time.monotonic()

    ensure_work_dirs(JOB_DIR)
    for name in ("input", "lib", "droid", "output"):
        clear(JOB_DIR / name)
    shutil.copy2(args.snapshot, JOB_DIR / "input" / "snapshot.html")
    shutil.copy2(args.adapter, JOB_DIR / "input" / "adapter.json")
    shutil.copy2(expected, JOB_DIR / "input" / "expected.json")
    shutil.copy2(LIB_SRC / "check_adapter.py", JOB_DIR / "lib" / "check_adapter.py")
    broken = json.loads(args.adapter.read_text(encoding="utf-8"))

    if DROID_SAVED_DIR:
        # Smoke test: the adapter Droid wrote in an earlier repair of this page, no Droid call. Its
        # version is set one above this broken adapter's, as Droid would; our checks below still decide.
        job = saved_droid_job("repair", {"adapter.json": "output/adapter.json"}, work_dir=JOB_DIR)
        saved = JOB_DIR / "output" / "adapter.json"
        if saved.is_file():
            data = json.loads(saved.read_text(encoding="utf-8"))
            saved.write_text(json.dumps({**data, "version": broken.get("version", 0) + 1}, indent=2), encoding="utf-8")
    else:
        job = await run_droid_job("repair", prompt(args.failed, list(broken["selectors"])), timeout=600,
                                  work_dir=JOB_DIR)
    print(f"\nDroid: success={job.success} subtype={job.subtype} seconds={job.duration} "
          f"factory_credits={job.factory_credits}")
    if job.error:
        print(f"error: {job.error}")
    if job.rejected:
        print(f"rejected actions: {job.rejected}")
    print(f"Droid's reply: {job.text!r}")

    def summarize(ok, problems=(), published=None, version=None):
        # For the backend: outcome, timings and credits.
        (JOB_DIR / "output" / "repair_summary.json").write_text(json.dumps({
            "success": ok, "problems": list(problems), "published": published, "version": version,
            "droid_subtype": job.subtype, "seconds": round(time.monotonic() - start, 2),
            "credits": job.factory_credits or 0.0}, indent=1), encoding="utf-8")

    fixed_path = JOB_DIR / "output" / "adapter.json"
    if not fixed_path.is_file():
        print("\nREPAIR FAILED: Droid wrote no output/adapter.json")
        summarize(False, ["Droid wrote no output/adapter.json"])
        return 1
    fixed = json.loads(fixed_path.read_text(encoding="utf-8"))
    passed, report = run_checker(fixed_path, JOB_DIR / "input" / "snapshot.html", JOB_DIR / "input" / "expected.json")
    print("\nOur checker on Droid's adapter (run by repair_adapter.py, not Droid):")
    print(report.rstrip())
    show_diff(broken, fixed)

    problems = []
    if not passed:
        problems.append("checker failed")
    if set(fixed.get("selectors", {})) != set(broken["selectors"]):
        problems.append("selector keys changed")
    if fixed.get("version") != broken.get("version", 0) + 1:
        problems.append(f"version is {fixed.get('version')}, expected {broken.get('version', 0) + 1}")
    if not args.no_publish and fixed.get("version", 0) <= published_version(args.site):
        problems.append(f"version not higher than the published v{published_version(args.site)}")
    # Our checks decide, not how Droid's turn ended; a changed protected folder always fails.
    if job.tampered:
        problems.append(job.error)
    if problems:
        print(f"\nREPAIR FAILED: {'; '.join(problems)} (not published)")
        summarize(False, problems, version=fixed.get("version"))
        return 1
    if not job.success:
        print(f"note: Droid's turn ended as {job.subtype}, but the adapter it wrote passes our checks")
    outcome = "skipped (--no-publish)" if args.no_publish else publish(args.site, fixed)
    print("\npublish: " + outcome)
    print(f"\nREPAIR PASSED in {time.monotonic() - start:.1f}s")
    summarize(True, published=outcome, version=fixed.get("version"))
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
