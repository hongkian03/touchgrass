"""Our own prompts.jsonl validator (not written by Droid).

Checks every line against schema.json next to this file and prints counts.
Errors name the line and field only, never the field's value, since values are chat text.
Exit code 1 if any line is invalid or the file has no exchanges.

Usage: py validate_prompts.py [path/to/prompts.jsonl]
       (default: $WORK_DIR/output/prompts.jsonl, WORK_DIR defaults to ./work)
"""

import json
import os
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

from jsonschema import Draft202012Validator

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.json"


def is_iso8601(value):
    try:
        datetime.fromisoformat(value)
        return True
    except (TypeError, ValueError):
        return False


def line_errors(validator, record):
    errors = []
    for err in validator.iter_errors(record):
        field = ".".join(str(p) for p in err.absolute_path) or "(line)"
        if err.validator == "additionalProperties":
            extra = sorted(set(record) - set(validator.schema["properties"]))
            errors.append(f"unexpected fields {extra}")
        elif err.validator == "required":
            missing = [k for k in validator.schema["required"] if k not in record]
            errors.append(f"missing fields {missing}")
        else:
            errors.append(f"{field}: fails '{err.validator}' check")
    if isinstance(record.get("ts"), str) and not is_iso8601(record["ts"]):
        errors.append("ts: not ISO 8601")
    return list(dict.fromkeys(errors))  # one "missing fields" entry even if several are missing


def main():
    work_dir = Path(os.environ.get("WORK_DIR", "work"))
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else work_dir / "output" / "prompts.jsonl"
    if not path.is_file():
        print(f"not found: {path}")
        return 1

    validator = Draft202012Validator(json.loads(SCHEMA_PATH.read_text(encoding="utf-8")))
    total = regenerated = images = 0
    models = Counter()
    invalid = []

    with path.open(encoding="utf-8") as f:
        for n, raw in enumerate(f, start=1):
            if not raw.strip():
                continue
            try:
                record = json.loads(raw)
            except json.JSONDecodeError as e:
                invalid.append((n, [f"not valid JSON ({e.msg})"]))
                continue
            if not isinstance(record, dict):
                invalid.append((n, ["not a JSON object"]))
                continue
            errors = line_errors(validator, record)
            if errors:
                invalid.append((n, errors))
                continue
            total += 1
            models[record["model"] or "(unknown)"] += 1
            regenerated += record["regenerated"]
            images += record["kind"] == "image"

    print(f"file: {path}")
    print(f"valid exchanges: {total}")
    print("exchanges per model:")
    for model, count in models.most_common():
        print(f"  {model}: {count}")
    print(f"regenerated: {regenerated}")
    print(f"images: {images}")
    print(f"invalid lines: {len(invalid)}")
    for n, errors in invalid:
        print(f"  line {n}: {'; '.join(errors)}")

    if invalid or total == 0:
        print("FAIL")
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
