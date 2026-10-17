"""Our own insights.json validator (not written by Droid).

Checks insights.json against insights_schema.json next to this file, plus two rules a JSON Schema
can't express: every range has low <= high, and tip ids are unique. Errors name the field, never
its value. Exit code 1 if anything is invalid.

Usage: py validate_insights.py [path/to/insights.json]
       (default: $WORK_DIR/output/insights.json, WORK_DIR defaults to ./work)
"""

import json
import os
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

SCHEMA_PATH = Path(__file__).resolve().parent / "insights_schema.json"


def ranges(obj, path="$"):
    if isinstance(obj, dict):
        if set(obj) == {"low", "high"}:
            yield path, obj
        for k, v in obj.items():
            yield from ranges(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from ranges(v, f"{path}[{i}]")


def errors_for(data):
    validator = Draft202012Validator(json.loads(SCHEMA_PATH.read_text(encoding="utf-8")))
    errors = []
    for err in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
        field = "$" + "".join(f"[{p}]" if isinstance(p, int) else f".{p}" for p in err.absolute_path)
        errors.append(f"{field}: fails '{err.validator}' check")
    for path, r in ranges(data):
        if all(isinstance(r[k], (int, float)) for k in ("low", "high")) and r["low"] > r["high"]:
            errors.append(f"{path}: low is greater than high")
    ids = [t.get("id") for t in data.get("tips", []) if isinstance(t, dict)]
    if len(ids) != len(set(ids)):
        errors.append("$.tips: ids are not unique")
    return errors


def main():
    work_dir = Path(os.environ.get("WORK_DIR", "work"))
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else work_dir / "output" / "insights.json"
    if not path.is_file():
        print(f"not found: {path}")
        return 1
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"not valid JSON ({e.msg})")
        return 1
    errors = errors_for(data)
    print(f"file: {path}")
    print(f"tips: {len(data.get('tips', [])) if isinstance(data, dict) else 0}")
    print(f"errors: {len(errors)}")
    for e in errors:
        print(f"  {e}")
    print("FAIL" if errors else "PASS")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
