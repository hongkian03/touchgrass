import json
from pathlib import Path
from typing import Literal

from pydantic import Field

from backend.coaching.rubric import fingerprint
from backend.coaching.schemas import ClassifyRequest, Contract


class Reference(Contract):
    origin_mode: Literal["mock", "live"] | None = None
    resolved_model_ids: list[str] = Field(default_factory=list)
    small_adequate: bool | None = Field(default=None, strict=True)
    large_adequate: bool | None = Field(default=None, strict=True)
    source: Literal["unresolved", "mock", "judge", "human"] = "unresolved"
    judge_disagreement: bool = False
    review_kind: Literal["none", "random", "targeted"] = "none"
    reviewer_id: str | None = None
    review_reason: str | None = None
    previous_small_adequate: bool | None = None
    executable_verification: Literal["unavailable", "passed", "failed"] = "unavailable"


class TaskRow(Contract):
    task_id: str = Field(min_length=1)
    group_id: str = Field(min_length=1)
    split: Literal["dev", "test"]
    family: str
    difficulty: Literal["simple", "medium", "hard"]
    consent: Literal["synthetic", "approved", "private"] = "private"
    request: ClassifyRequest
    reference: Reference = Field(default_factory=Reference)


def load_dataset(path):
    rows = [
        TaskRow.model_validate_json(line)
        for line in Path(path).read_text().splitlines()
        if line.strip()
    ]
    if not rows:
        raise ValueError("empty dataset")
    ids, groups, inputs = set(), {}, {}
    for row in rows:
        if row.task_id in ids:
            raise ValueError("duplicate task ID")
        ids.add(row.task_id)
        if row.group_id in groups and groups[row.group_id] != row.split:
            raise ValueError("related tasks cross dev/test boundary")
        groups[row.group_id] = row.split
        input_key = fingerprint(
            {
                "prompt": row.request.prompt_text.strip(),
                "context": [m.model_dump() for m in row.request.recent_messages],
            }
        )
        if input_key in inputs and inputs[input_key] != row.split:
            raise ValueError("identical inputs cross dev/test boundary")
        inputs[input_key] = row.split
    return rows


def revision(rows):
    return fingerprint([r.model_dump(mode="json") for r in rows])


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")
    temporary.replace(path)


def write_dataset(path, rows):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(row.model_dump_json() + "\n" for row in rows))
