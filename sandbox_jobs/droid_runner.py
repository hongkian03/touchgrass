"""F1: the shared Droid job runner. Every Droid job goes through run_droid_job.

Runs one Droid turn in WORK_DIR/droid with a path-restricted permission handler, writes every
message to WORK_DIR/logs/<job_name>.jsonl, prints a short version to stdout, and returns a
JobResult instead of raising.

Permission rules (enforced by our handler, not by Droid):
- file writes (create, edit, patch) only inside WORK_DIR/droid or WORK_DIR/output
- commands only if every part runs python or pytest on files inside WORK_DIR (no python -c,
  no pipes or redirects); `cd` into WORK_DIR is allowed between them
- everything else is cancelled and logged as rejected

Session autonomy defaults to OFF so that every edit and command reaches the handler. At higher
levels Droid runs those actions on its own and the path check never sees them.

Defense in depth: lib/ and input/ are fingerprinted before and after the turn. A script Droid
wrote could still write there when we run it, so a changed fingerprint fails the job.

Log lines hold the message type, tool names, file paths and commands, and short assistant text.
Tool results are logged by name and error flag only, never their content, since they can hold
text read from a user's export.
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
SUBDIRS = ["input", "lib", "droid", "output", "logs"]
WRITABLE = [WORK_DIR / "droid", WORK_DIR / "output"]
PROTECTED = [WORK_DIR / "lib", WORK_DIR / "input"]
PYTHON_EXES = {"python", "python3", "py", "python.exe", "python3.exe", "py.exe"}
SHELL_META = re.compile(r"[|;<>`]|\$\(|(?<!&)&(?!&)")  # && is split into parts; a lone & is not allowed
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


def ensure_work_dirs():
    for name in SUBDIRS:
        (WORK_DIR / name).mkdir(parents=True, exist_ok=True)


def _short(text, limit=MAX_TEXT):
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _inside(path, roots):
    p = Path(path)
    if not p.is_absolute():
        p = WORK_DIR / "droid" / p  # Droid's cwd
    p = p.resolve()
    return any(p == root or p.is_relative_to(root) for root in roots)


def _fingerprint(folder):
    h = hashlib.sha256()
    for p in sorted(folder.rglob("*")):
        h.update(p.relative_to(folder).as_posix().encode())
        if p.is_file():
            h.update(p.read_bytes())
    return h.hexdigest()


def _check_command(command):
    """Return None if allowed, else the reason it's rejected."""
    if SHELL_META.search(command):
        return "pipes, redirects and command chaining other than && are not allowed"
    for part in (p.strip() for p in command.split("&&")):
        try:
            tokens = shlex.split(part, posix=os.name != "nt")
        except ValueError:
            return f"could not parse {part!r}"
        tokens = [t.strip("'\"") for t in tokens]
        if not tokens:
            continue
        exe = Path(tokens[0]).name.lower()
        if exe in ("cd", "set-location") and len(tokens) == 2:
            if not _inside(tokens[1], [WORK_DIR]):
                return f"cd outside WORK_DIR: {tokens[1]}"
            continue
        args = tokens[1:]
        if exe in PYTHON_EXES:
            if "-c" in args:
                return "python -c is not allowed; write a script inside WORK_DIR instead"
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
            if not _inside(a, [WORK_DIR]):
                return f"file outside WORK_DIR: {a}"
    return None


def _check_action(action):
    """Return None if allowed, else the reason it's rejected."""
    if isinstance(action, (CreateFile, EditAction)):
        paths = [action.file_path]
    elif isinstance(action, ApplyPatchAction):
        paths = [action.file_path] + [p for f in (action.files or ()) for p in (f.file_path, f.move_to) if p]
    elif isinstance(action, ExecuteAction):
        return _check_command(action.full_command or action.command)
    else:
        return f"{type(action).__name__} is not allowed"
    outside = list(dict.fromkeys(p for p in paths if not _inside(p, WRITABLE)))
    return f"write outside droid/ or output/: {', '.join(outside)}" if outside else None


def _describe(action):
    if isinstance(action, ExecuteAction):
        return f"execute: {action.full_command or action.command}"
    if hasattr(action, "file_path"):
        return f"{type(action).__name__}: {action.file_path}"
    return type(action).__name__


async def run_droid_job(job_name, prompt, output_model=None, timeout=600, autonomy=Autonomy.OFF) -> JobResult:
    ensure_work_dirs()
    log_path = WORK_DIR / "logs" / f"{job_name}.jsonl"
    rejected = []
    start = time.monotonic()

    def log(kind, **fields):
        line = {"ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"), "job": job_name,
                "type": kind, **{k: _short(v) if isinstance(v, str) else v for k, v in fields.items()}}
        with log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")
        detail = " ".join(f"{k}={v}" for k, v in line.items() if k not in ("ts", "job", "type"))
        print(f"[{job_name}] {kind} {detail}".rstrip(), flush=True)

    def on_permission(request: PermissionRequest) -> PermissionResponse:
        reasons = [(a, _check_action(a)) for a in request.actions]
        offered = {o.value for o in request.options}
        denied = [(a, r) for a, r in reasons if r]
        if denied:
            for a, reason in denied:
                rejected.append(f"{_describe(a)} ({reason})")
                log("permission_rejected", action=_describe(a), reason=reason)
            return PermissionResponse(selected_option=ToolConfirmationOutcome.CANCEL)
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
        return request.cancel()

    before = {p.name: _fingerprint(p) for p in PROTECTED}
    log("job_start", cwd=str(WORK_DIR / "droid"), autonomy=autonomy.value, timeout=timeout)
    session = Session(
        cwd=WORK_DIR / "droid",
        model="auto",
        config=SessionConfig(autonomy=autonomy),
        interactions=InteractionHandlers(on_permission=on_permission, on_question=on_question),
    )
    result = None
    error = None
    try:
        async with session:
            stream = session.stream(prompt, timeout=timeout, output=output_model)
            async for event in stream:
                if isinstance(event, AssistantMessage) and event.text:
                    log("assistant", text=event.text)
                elif isinstance(event, ToolCall):
                    inp = event.input or {}
                    target = inp.get("file_path") or inp.get("command") or inp.get("path") or ""
                    log("tool_call", tool=event.name, target=str(target))
                elif isinstance(event, ToolResult):
                    log("tool_result", tool=event.tool_name, is_error=event.is_error)
                elif isinstance(event, ErrorEvent):
                    log("error", text=event.message)
            result = stream.result
    except RunTimeoutError:
        error = f"timed out after {timeout}s"
    except DroidError as e:
        error = f"{type(e).__name__}: {e}"

    duration = round(time.monotonic() - start, 2)
    changed = [name for name, digest in before.items() if _fingerprint(WORK_DIR / name) != digest]
    if changed:
        error = f"protected folder changed during the job: {', '.join(changed)}"

    credits = result.usage.factory_credits if result is not None and result.usage else None
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
    )
    log("job_end", success=job.success, subtype=job.subtype, seconds=duration,
        factory_credits=credits, rejected=len(rejected), error=error)
    return job
