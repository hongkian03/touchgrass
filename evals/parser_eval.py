"""Independent normalized-exchange scoring; the ingest owner supplies the runner."""

import argparse
import importlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import Field, ValidationError, field_validator

from backend.coaching.schemas import Contract

from .data import write_json
from .metrics import ratio


class Exchange(Contract):
    source_exchange_id: str = Field(min_length=1)
    ts: datetime | None = None
    provider: str | None = None
    model: str | None = None
    kind: Literal["text", "image", "video"] | None = None
    prompt_text: str | None = None
    response_text: str | None = None
    regenerated: bool | None = Field(default=None, strict=True)

    @field_validator("ts")
    @classmethod
    def timezone_required(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("timestamps must include timezone")
        return value.astimezone(timezone.utc) if value else None


class IngestAttempt(Contract):
    attempt_id: str
    parser_hash: str
    cache_used: bool
    success_first_attempt: bool
    repair_iterations: int = Field(ge=0)
    records: list[dict]


def score_parser(reference, actual, tolerance_seconds=1.0):
    if tolerance_seconds < 0:
        raise ValueError("negative timestamp tolerance")
    refs = [Exchange.model_validate(r) for r in reference]
    if len({r.source_exchange_id for r in refs}) != len(refs):
        raise ValueError(
            "reference IDs must be unique, including branches/regenerations"
        )
    valid = []
    invalid = 0
    for record in actual:
        try:
            valid.append(Exchange.model_validate(record))
        except ValidationError:
            invalid += 1
    counts = Counter(r.source_exchange_id for r in valid)
    expected = {r.source_exchange_id: r for r in refs}
    by_id = {
        r.source_exchange_id: r for r in valid if counts[r.source_exchange_id] == 1
    }
    overlap = set(expected) & set(counts)
    duplicates = sum(n - 1 for n in counts.values())
    fields = {}
    for field in [
        "ts",
        "provider",
        "model",
        "kind",
        "prompt_text",
        "response_text",
        "regenerated",
    ]:
        available = [r for r in refs if getattr(r, field) is not None]
        agreed = 0
        for ref in available:
            candidate = by_id.get(ref.source_exchange_id)
            if candidate is None:
                continue  # duplicates have ambiguous alignment
            a, b = getattr(ref, field), getattr(candidate, field)
            agreed += b is not None and (
                abs((a - b).total_seconds()) <= tolerance_seconds
                if field == "ts"
                else a == b
            )
        fields[field] = {
            "agreement": ratio(agreed, len(available)),
            "source_available": len(available),
            "source_unknown": len(refs) - len(available),
        }
    return {
        "exchange_precision": ratio(len(overlap), len(actual)),
        "exchange_recall": ratio(len(overlap), len(refs)),
        "missing": len(set(expected) - set(counts)),
        "extra": sum(counts[k] for k in counts.keys() - expected.keys()),
        "duplicates": duplicates,
        "schema_invalid": invalid,
        "schema_valid": invalid == 0,
        "fields": fields,
        "timestamp_tolerance_seconds": tolerance_seconds,
    }


def run_attempts(source, reference, runner):
    if runner is None or reference is None:
        return {
            "status": "not_run",
            "reason": "independent_reference_and_ingest_runner_required",
        }
    attempts = []
    seen = set()
    for _ in range(5):
        attempt_id = str(uuid4())
        result = IngestAttempt.model_validate(
            runner(source=source, attempt_id=attempt_id, disable_parser_cache=True)
        )
        if result.attempt_id != attempt_id or result.attempt_id in seen:
            raise ValueError("ingest runner must preserve unique attempt IDs")
        seen.add(result.attempt_id)
        attempts.append(
            {
                **result.model_dump(exclude={"records"}),
                "score": score_parser(reference, result.records),
            }
        )
    return {
        "status": "completed",
        "fresh_attempts": sum(not a["cache_used"] for a in attempts),
        "cached_attempts": sum(a["cache_used"] for a in attempts),
        "attempts": attempts,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--reference")
    p.add_argument("--actual", help="Score one existing normalized JSON array")
    p.add_argument(
        "--runner", help="Owner-supplied Python module:callable; runs five attempts"
    )
    p.add_argument("--source")
    p.add_argument("--output", default="artifacts/parser-report.json")
    args = p.parse_args()
    reference = json.loads(Path(args.reference).read_text()) if args.reference else None
    if args.actual and reference is not None:
        result = score_parser(reference, json.loads(Path(args.actual).read_text()))
    else:
        runner = None
        if args.runner:
            module, name = args.runner.split(":", 1)
            runner = getattr(importlib.import_module(module), name)
        result = run_attempts(args.source, reference, runner)
    write_json(args.output, result)
    print(json.dumps({"report": args.output, "status": result.get("status", "scored")}))


if __name__ == "__main__":
    main()
