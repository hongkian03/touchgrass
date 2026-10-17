"""Privacy test: none of the user's real text may reach Droid.

Run after an end-to-end run on the planted sample, from the repo root:
    py sandbox_jobs/run_jobs.py --droid     (with samples/chatgpt_planted/conversations.json in work/input)
    py -m pytest sandbox_jobs/test_privacy.py

The planted sample contains marker words (samples/chatgpt_planted/markers.txt) that appear nowhere
in the fake data Droid is allowed to see. The test fails if any marker shows up in Droid's logs, in
its full transcripts (every prompt, message, tool input and tool result), or in any file in its view
folders, and if Droid used a file-reading tool. A control test first checks the markers really are
in the real data, so the test can't pass by accident.
"""

import json
from pathlib import Path

import pytest

from droid_runner import DROID_VIEW_DIR, WORK_DIR

MARKERS_FILE = Path(__file__).resolve().parent / "samples" / "chatgpt_planted" / "markers.txt"
MARKERS = [line.strip() for line in MARKERS_FILE.read_text(encoding="utf-8").splitlines()
           if line.strip() and not line.startswith("#")]
JOBS = ["ingest", "analyze"]
READING_TOOLS = {"Read", "Grep"}


def text_of(path):
    return path.read_bytes().decode("utf-8", errors="ignore").lower()


def markers_in(path):
    text = text_of(path)
    return [m for m in MARKERS if m.lower() in text]


def transcripts():
    return [WORK_DIR / "logs" / f"{job}.transcript.jsonl" for job in JOBS]


def test_planted_markers_are_in_the_real_data():
    exports = [p for p in (WORK_DIR / "input").iterdir() if p.is_file()]
    assert exports, "no export in work/input; run the end-to-end job on the planted sample first"
    assert set(markers_in(exports[0])) == set(MARKERS), f"control failed: markers missing from {exports[0]}"
    # Titles don't reach prompts.jsonl, so not every marker does; the prompt and response markers must.
    assert markers_in(WORK_DIR / "output" / "prompts.jsonl"), "control failed: no markers in real prompts.jsonl"


def test_droid_transcripts_exist():
    for path in transcripts():
        assert path.is_file(), f"{path} missing; run the end-to-end job first"


@pytest.mark.parametrize("job", JOBS)
def test_no_marker_in_droid_logs_or_messages(job):
    for path in (WORK_DIR / "logs" / f"{job}.jsonl", WORK_DIR / "logs" / f"{job}.transcript.jsonl"):
        found = markers_in(path)
        assert not found, f"marker words {found} reached Droid: found in {path}"


def test_no_marker_in_droid_view():
    files = [p for p in DROID_VIEW_DIR.rglob("*") if p.is_file()]
    assert files, f"{DROID_VIEW_DIR} is empty; run the end-to-end job first"
    leaks = {str(p): markers_in(p) for p in files if markers_in(p)}
    assert not leaks, f"marker words found in Droid's view folder: {leaks}"


def test_droid_used_no_file_reading_tools():
    for path in transcripts():
        used = {json.loads(line).get("tool") for line in path.read_text(encoding="utf-8").splitlines()
                if line.strip() and json.loads(line).get("type") == "tool_call"}
        assert not used & READING_TOOLS, f"Droid used {used & READING_TOOLS} in {path.name}"
