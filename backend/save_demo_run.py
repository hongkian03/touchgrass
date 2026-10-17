"""F7: save a successful backend job as a demo fallback, for DEMO_REPLAY=1 (backend/executor.py).

  py backend/save_demo_run.py upload JOB_ID --export sandbox_jobs/samples/chatgpt_fake/conversations.json
  py backend/save_demo_run.py repair JOB_ID

Copies the job's short Droid logs (logs/*.jsonl, not the full transcripts), its results and its
job summary into backend/demo_runs/<kind>/. An upload job deletes its prompts.jsonl when it
finishes, so for the saved copy it's rebuilt by running that job's own parser on --export (the
fake sample the demo uses), without Droid. Only save runs on fake data: the saved files are
committed.
"""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))
from backend.jobs import JobStore  # noqa: E402

JOB_ROOT = REPO / "work" / "jobs"
DEMO_RUNS = REPO / "backend" / "demo_runs"
LOG_ORDER = {"upload": ["ingest.jsonl", "analyze.jsonl"], "repair": ["repair.jsonl"]}


def rebuild_prompts(job_dir, export, dst):
    """Run the job's own parser on the fake export in a scratch folder, without Droid."""
    tmp = Path(tempfile.mkdtemp(prefix="demo_prompts_"))
    try:
        for name in ("input", "droid", "output"):
            (tmp / name).mkdir()
        shutil.copy2(export, tmp / "input" / Path(export).name)
        parser = job_dir / "droid" / "parser.py"
        if not parser.is_file():
            # The Analyst clears droid/ for its own script; the parser that ran is the cached one.
            fp = json.loads((job_dir / "output" / "ingest_summary.json").read_text(encoding="utf-8"))["fingerprint"]
            parser = REPO / "parser_cache" / fp / "parser.py"
        shutil.copy2(parser, tmp / "droid" / "parser.py")
        subprocess.run([sys.executable, "parser.py"], cwd=tmp / "droid", check=True, capture_output=True, timeout=120)
        shutil.copy2(tmp / "output" / "prompts.jsonl", dst)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("kind", choices=["upload", "repair"])
    ap.add_argument("job_id")
    ap.add_argument("--export", type=Path, help="upload only: the fake export the job ran on")
    args = ap.parse_args()

    job = JobStore().get(args.job_id)
    if job is None or job["status"] != "succeeded":
        raise SystemExit(f"job {args.job_id} isn't a succeeded job ({job and job['status']})")
    job_dir = JOB_ROOT / args.job_id
    out = DEMO_RUNS / args.kind
    if out.exists():
        shutil.rmtree(out)
    (out / "logs").mkdir(parents=True)
    # A cache-hit ingest calls no Droid and writes no ingest.jsonl, so keep whichever logs exist.
    log_order = [name for name in LOG_ORDER[args.kind] if (job_dir / "logs" / name).is_file()]
    if not log_order:
        raise SystemExit(f"job {args.job_id} has no Droid logs to replay")
    for name in log_order:
        shutil.copy2(job_dir / "logs" / name, out / "logs" / name)

    if args.kind == "upload":
        if not args.export:
            raise SystemExit("upload needs --export (the fake sample the job ran on)")
        shutil.copy2(job_dir / "output" / "insights.json", out / "insights.json")
        rebuild_prompts(job_dir, args.export, out / "prompts.jsonl")
    else:
        shutil.copy2(job_dir / "mechanic" / "output" / "adapter.json", out / "adapter.json")
        shutil.copy2(job_dir / "mechanic" / "input" / "adapter.json", out / "broken_adapter.json")

    (out / "summary.json").write_text(json.dumps({
        "saved_from_job": args.job_id, "created_at": job["created_at"], "finished_at": job["finished_at"],
        "log_order": log_order, "job_summary": job["summary"]}, indent=1), encoding="utf-8")
    print(f"saved {args.kind} job {args.job_id} to {out.relative_to(REPO)}:")
    for p in sorted(out.rglob("*")):
        if p.is_file():
            print(f"  {p.relative_to(out)} ({p.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
