"""Privacy test: none of the user's real text may reach Droid.

Run after an end-to-end run on the planted sample, from the repo root:
    py sandbox_jobs/run_jobs.py --droid     (with samples/chatgpt_planted/conversations.json in work/input)
    py -m pytest sandbox_jobs/test_privacy.py

The planted sample contains marker words (samples/chatgpt_planted/markers.txt) that appear nowhere
in the fake data Droid is allowed to see. The test fails if any marker shows up in Droid's logs, in
its full transcripts (every prompt, message, tool input and tool result), or in any file in its view
folders, and if Droid's file tools (Read, Grep, LS, Glob) were pointed outside its own folder. A
control test first checks the markers really are in the real data, so the test can't pass by accident.
"""

import ast
import json
from pathlib import Path

import pytest

from droid_runner import DROID_VIEW_DIR, WORK_DIR

MARKERS_FILE = Path(__file__).resolve().parent / "samples" / "chatgpt_planted" / "markers.txt"
MARKERS = [line.strip() for line in MARKERS_FILE.read_text(encoding="utf-8").splitlines()
           if line.strip() and not line.startswith("#")]
JOBS = ["ingest", "analyze"]
FILE_TOOLS = {"Read", "Grep", "LS", "Glob"}


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


def _paths_in(tool_input):
    """Path-like values a file tool was called with (keys such as file_path, path, directory)."""
    if isinstance(tool_input, str):
        # Transcripts written before the runner stored inputs as JSON hold them as Python reprs.
        tool_input = ast.literal_eval(tool_input)
    return [v for k, v in tool_input.items()
            if isinstance(v, str) and any(w in k.lower() for w in ("path", "dir", "folder", "file"))]


@pytest.mark.parametrize("job", JOBS)
def test_droid_file_tools_stayed_in_its_folder(job):
    # Read and Grep never reach the permission handler, so check every path they were given.
    view = (DROID_VIEW_DIR / job).resolve()
    transcript = WORK_DIR / "logs" / f"{job}.transcript.jsonl"
    outside = []
    for line in transcript.read_text(encoding="utf-8").splitlines():
        entry = json.loads(line) if line.strip() else {}
        if entry.get("type") != "tool_call" or entry.get("tool") not in FILE_TOOLS:
            continue
        for p in _paths_in(entry.get("input") or {}):
            resolved = (Path(p) if Path(p).is_absolute() else view / "droid" / p).resolve()
            if not resolved.is_relative_to(view):
                outside.append(f"{entry['tool']}: {p}")
    assert not outside, f"Droid's file tools left {view}: {outside}"
