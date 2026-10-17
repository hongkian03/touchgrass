"""F1: the shared Droid job runner. Every Droid job goes through run_droid_job.

Runs Droid in <root>/droid with a path-restricted permission handler, writes every message to
WORK_DIR/logs/<job_name>.jsonl, prints a short version to stdout, and returns a JobResult instead
of raising. <root> is WORK_DIR by default. Jobs that handle user data pass a separate Droid view
folder as work_dir, holding only redacted or fake data; their own code then runs the scripts
Droid wrote on the real data in WORK_DIR, without Droid. Logs always go to WORK_DIR/logs, which
Droid can't write to.

Permission rules (enforced by our handler, not by Droid):
- file writes (create, edit, patch) only inside <root>/droid or <root>/output
- commands only if every part runs python or pytest on files inside <root> (no python -c,
  no pipes or redirects); `cd` into <root> is allowed between them
- everything else is cancelled and logged as rejected

A refused action ends Droid's turn, so after a refusal the runner sends up to max_followups more
turns in the same session, telling Droid what was refused and to carry on.

Session autonomy defaults to OFF so that every edit and command reaches the handler. At higher
levels Droid runs those actions on its own and the path check never sees them. File reads never
reach the handler and the SDK can only turn a tool off entirely, so jobs on user data rely on the
folder Droid works in holding no real data; see PRIVATE_DATA_DISABLED_TOOLS.

Defense in depth: <root>/lib and <root>/input, plus WORK_DIR's input, lib, output and droid when
Droid works elsewhere, are fingerprinted before and after the turn. A script Droid wrote could
still write there when we run it, so a changed fingerprint fails the job.

Two records of each job:
- logs/<job>.jsonl: message types, tool names, file paths, commands and assistant text capped at
  200 characters; tool results by name and error flag only.
- logs/<job>.transcript.jsonl: everything Droid sent and received in full (tool inputs, tool
  results, messages, structured output). This is what the privacy test scans: anything Droid saw
  is in here.
"""

import hashlib
import json
import os
import re
import shlex
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from droid_sdk import (
    ApplyPatchAction,
    AssistantMessage,
    Autonomy,
    CreateFile,
    DroidError,
    EditAction,
    ErrorEvent,
    ExecuteAction,
    InteractionHandlers,
    PermissionRequest,
    PermissionResponse,
    QuestionRequest,
    QuestionResponse,
    RunTimeoutError,
    Session,
    SessionConfig,
    ToolCall,
    ToolConfirmationOutcome,
    ToolResult,
)

WORK_DIR = Path(os.environ.get("WORK_DIR", "work")).resolve()
# Where Droid works on jobs that touch user data: outside WORK_DIR, holding only redacted or fake data.
DROID_VIEW_DIR = Path(os.environ.get("DROID_VIEW_DIR", WORK_DIR.parent / "droid_view")).resolve()
SUBDIRS = ["input", "lib", "droid", "output", "logs"]
# Tools off for jobs on user data: the web tools, which the jobs don't need, and Task (subagents),
# whose permission requests reach the handler in shapes it doesn't expect. Read and Grep stay on:
# with them off, three end-to-end attempts failed (Droid worked blind and fell back on workarounds),
# so Droid may read, but only ever works in a folder holding redacted or fake data. File reads
# never reach the permission handler, so an absolute path could still open other files; the
# privacy test (test_privacy.py) is what checks nothing real reached Droid.
PRIVATE_DATA_DISABLED_TOOLS = ["FetchUrl", "WebSearch", "Task"]
# Passing any disabled_tools also drops Droid's file-writing tools from the session (tested: with
# only Grep, FetchUrl and WebSearch disabled, the session had just Read, LS, Glob and Execute), so
# jobs that disable tools must enable the ones they need explicitly.
PRIVATE_DATA_ENABLED_TOOLS = ["Read", "Grep", "LS", "Glob", "Create", "Edit", "ApplyPatch", "Execute", "TodoWrite"]
PYTHON_EXES = {"python", "python3", "py", "python.exe", "python3.exe", "py.exe"}
# && and ; (PowerShell's separator) split a command into parts that are each checked; pipes,
# redirects, subshells and a lone & are not allowed.
SHELL_META = re.compile(r"[|<>`]|\$\(|(?<!&)&(?!&)")
SEPARATORS = re.compile(r"&&|;")
MAX_TEXT = 200


@dataclass
class JobResult:
    success: bool
    subtype: str
    text: str | None
    structured: Any
    duration: float
    factory_credits: float | None
    log_path: Path
    rejected: list[str] = field(default_factory=list)
    error: str | None = None
    transcript_path: Path | None = None

    @property
    def tampered(self):
        """A protected folder changed during the job. Always a failure, whatever else passed."""
        return bool(self.error and self.error.startswith("protected folder changed"))


def ensure_work_dirs(root=None):
    for name in SUBDIRS:
        (Path(root or WORK_DIR) / name).mkdir(parents=True, exist_ok=True)


def _short(text, limit=MAX_TEXT):
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _inside(path, roots, root=None):
    p = Path(path)
    if not p.is_absolute():
        p = Path(root or WORK_DIR) / "droid" / p  # Droid's cwd
    p = p.resolve()
    return any(p == r or p.is_relative_to(r) for r in roots)


def _fingerprint(folder):
    h = hashlib.sha256()
    if not folder.exists():
        return h.hexdigest()
    for p in sorted(folder.rglob("*")):
        # Importing a module from lib/ makes Python write __pycache__ there; that isn't a change to our files.
        if "__pycache__" in p.parts or p.suffix == ".pyc":
            continue
        h.update(p.relative_to(folder).as_posix().encode())
        if p.is_file():
            h.update(p.read_bytes())
    return h.hexdigest()


def _check_command(command, root=None):
    """Return None if allowed, else the reason it's rejected."""
    root = Path(root or WORK_DIR)
    if SHELL_META.search(command):
        return "pipes, redirects, subshells and background & are not allowed"
    for part in (p.strip() for p in SEPARATORS.split(command)):
        try:
            tokens = shlex.split(part, posix=os.name != "nt")
        except ValueError:
            return f"could not parse {part!r}"
        tokens = [t.strip("'\"") for t in tokens]
        if not tokens:
            continue
        exe = Path(tokens[0]).name.lower()
        if exe in ("cd", "set-location") and len(tokens) == 2:
            if not _inside(tokens[1], [root], root):
                return f"cd outside the work folder: {tokens[1]}"
            continue
        args = tokens[1:]
        if exe in PYTHON_EXES:
            if "-c" in args:
                return "python -c is not allowed; write a script in the droid folder instead"
            if args[:2] == ["-m", "pytest"]:
                args = args[2:]
            elif args[:1] == ["-m"]:
                return f"python -m {args[1] if len(args) > 1 else ''} is not allowed (only pytest)"
            elif not any(a.endswith(".py") for a in args):
                return "python must run a script file"
        elif exe not in ("pytest", "pytest.exe"):
            return f"only python or pytest may run, not {tokens[0]!r}"
        files = [a for a in args if not a.startswith("-")]
        for a in files:
            if not _inside(a, [root], root):
                return f"file outside the work folder: {a}"
    return None


def _check_action(action, root=None):
    """Return None if allowed, else the reason it's rejected."""
    root = Path(root or WORK_DIR)
    if isinstance(action, (CreateFile, EditAction)):
        paths = [action.file_path]
    elif isinstance(action, ApplyPatchAction):
        paths = [action.file_path] + [p for f in (action.files or ()) for p in (f.file_path, f.move_to) if p]
    elif isinstance(action, ExecuteAction):
        return _check_command(action.full_command or action.command, root)
    else:
        return f"{type(action).__name__} is not allowed"
    writable = [root / "droid", root / "output"]
    outside = list(dict.fromkeys(p for p in paths if not _inside(p, writable, root)))
    return f"write outside droid/ or output/: {', '.join(outside)}" if outside else None


def _describe(action):
    if isinstance(action, ExecuteAction):
        return f"execute: {action.full_command or action.command}"
    if hasattr(action, "file_path"):
        return f"{type(action).__name__}: {action.file_path}"
    return type(action).__name__


def _jsonable(value):
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


async def run_droid_job(job_name, prompt, output_model=None, timeout=600, autonomy=Autonomy.OFF,
                        max_followups=2, work_dir=None, disabled_tools=None, enabled_tools=None) -> JobResult:
    root = Path(work_dir).resolve() if work_dir else WORK_DIR
    ensure_work_dirs(root)
    ensure_work_dirs(WORK_DIR)
    log_path = WORK_DIR / "logs" / f"{job_name}.jsonl"
    transcript_path = WORK_DIR / "logs" / f"{job_name}.transcript.jsonl"
    rejected = []
    start = time.monotonic()

    def log(kind, **fields):
        line = {"ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"), "job": job_name,
                "type": kind, **{k: _short(v) if isinstance(v, str) else v for k, v in fields.items()}}
        with log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")
        detail = " ".join(f"{k}={v}" for k, v in line.items() if k not in ("ts", "job", "type"))
        print(f"[{job_name}] {kind} {detail}".rstrip(), flush=True)

    def record(kind, **fields):
        line = {"ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"), "job": job_name,
                "type": kind, **{k: _jsonable(v) for k, v in fields.items()}}
        with transcript_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")

    def check(action):
        # The handler must never raise (an exception here stalls Droid): anything we can't check is refused.
        try:
            return _check_action(action, root)
        except Exception as e:
            return f"could not check {type(action).__name__} ({type(e).__name__})"

    def on_permission(request: PermissionRequest) -> PermissionResponse:
        reasons = [(a, check(a)) for a in request.actions]
        offered = {o.value for o in request.options}
        denied = [(a, r) for a, r in reasons if r]
        if denied:
            for a, reason in denied:
                rejected.append(f"{_describe(a)} ({reason})")
                log("permission_rejected", action=_describe(a), reason=reason)
            return PermissionResponse(
                selected_option=ToolConfirmationOutcome.CANCEL,
                comment="Refused by the job's permission rules: " + "; ".join(r for _, r in denied),
            )
        for a, _ in reasons:
            log("permission_approved", action=_describe(a))
        choice = ToolConfirmationOutcome.PROCEED_ONCE
        if choice not in offered:  # never pick an "always" option, so every action is checked
            choice = next((o for o in offered if o.name.startswith("PROCEED") and "ALWAYS" not in o.name
                           and "AUTO" not in o.name and "NEW_SESSION" not in o.name), ToolConfirmationOutcome.CANCEL)
        return PermissionResponse(selected_option=choice)

    def on_question(request: QuestionRequest) -> QuestionResponse:
        # Jobs run unattended: nobody can answer, so decline and let Droid decide from the prompt.
        log("question_declined", questions=" | ".join(q.question for q in request.questions))
        record("question", questions=[q.question for q in request.questions])
        return request.cancel()

    protected = [root / "lib", root / "input"]
    if root != WORK_DIR:
        protected += [WORK_DIR / name for name in ("input", "lib", "output", "droid")]
    before = {p: _fingerprint(p) for p in protected}
    log("job_start", cwd=str(root / "droid"), autonomy=autonomy.value, timeout=timeout,
        disabled_tools=",".join(disabled_tools or []))
    record("prompt", text=prompt)
    session = Session(
        cwd=root / "droid",
        model="auto",
        config=SessionConfig(autonomy=autonomy, disabled_tools=disabled_tools, enabled_tools=enabled_tools),
        interactions=InteractionHandlers(on_permission=on_permission, on_question=on_question),
    )
    result = None
    error = None
    turn_credits = []
    try:
        async with session:
            turn_prompt = prompt
            for turn in range(1 + max_followups):
                remaining = timeout - (time.monotonic() - start)
                if remaining <= 0:
                    raise RunTimeoutError(f"timed out after {timeout}s")
                rejected_before = len(rejected)
                stream = session.stream(turn_prompt, timeout=remaining, output=output_model)
                async for event in stream:
                    if isinstance(event, AssistantMessage) and event.text:
                        log("assistant", text=event.text)
                        record("assistant", text=event.text)
                    elif isinstance(event, ToolCall):
                        inp = event.input or {}
                        target = inp.get("file_path") or inp.get("command") or inp.get("path") or ""
                        log("tool_call", tool=event.name, target=str(target))
                        record("tool_call", tool=event.name, input=inp)
                    elif isinstance(event, ToolResult):
                        log("tool_result", tool=event.tool_name, is_error=event.is_error)
                        record("tool_result", tool=event.tool_name, is_error=event.is_error, content=event.content)
                    elif isinstance(event, ErrorEvent):
                        log("error", text=event.message)
                        record("error", text=event.message)
                result = stream.result
                credits_now = result.usage.factory_credits if result.usage else None
                turn_credits.append(credits_now)
                log("turn_end", turn=turn + 1, success=result.success, subtype=result.subtype,
                    factory_credits=credits_now)
                record("turn_end", text=result.text, output=result.output)
                # A refused action ends Droid's turn. Tell it why and let it carry on in the same
                # session (it keeps its context), a limited number of times.
                new_rejections = rejected[rejected_before:]
                if result.success or not new_rejections or turn == max_followups:
                    break
                tools = "LS and Glob" if "Read" in (disabled_tools or []) else "LS, Glob, Read"
                turn_prompt = (
                    "Your last action was refused by the job's permission rules, which ended your turn: "
                    + "; ".join(new_rejections)
                    + f". Continue the original task from where you left off, using only the allowed "
                    f"commands and your file tools ({tools}) for looking at files. Create and change "
                    "files with your file tools (Create, Edit or ApplyPatch), never with shell "
                    "commands. Follow the original instructions about what not to read."
                )
                log("followup", turn=turn + 2, reason=new_rejections[-1])
                record("prompt", text=turn_prompt)
    except RunTimeoutError:
        error = f"timed out after {timeout}s"
    except DroidError as e:
        error = f"{type(e).__name__}: {e}"

    duration = round(time.monotonic() - start, 2)
    changed = [str(p) for p, digest in before.items() if _fingerprint(p) != digest]
    if changed:
        error = f"protected folder changed during the job: {', '.join(changed)}"

    # Each turn's usage as reported at its end, summed. turn_end log lines keep the per-turn values.
    known = [c for c in turn_credits if c is not None]
    credits = sum(known) if known else None
    job = JobResult(
        success=result is not None and result.success and error is None,
        subtype=result.subtype if result is not None and error is None else "error",
        text=result.text if result is not None else None,
        structured=result.output if result is not None else None,
        duration=duration,
        factory_credits=credits,
        log_path=log_path,
        rejected=rejected,
        error=error,
        transcript_path=transcript_path,
    )
    log("job_end", success=job.success, subtype=job.subtype, seconds=duration, turns=len(turn_credits),
        factory_credits=credits, rejected=len(rejected), error=error)
    return job
