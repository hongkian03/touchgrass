"""Redacted copy of a chat export for Droid. Ours; Droid never edits it.

The copy keeps the export's exact structure (same keys, nesting, list lengths, value types, and so
the same fingerprint) but replaces text with a placeholder like "<text 42 chars>", so Droid can
write a parser without seeing what the user wrote.

What is kept, because a parser needs it and it isn't free text:
- numbers, booleans, nulls, dict keys, and empty strings
- timestamps (ISO 8601 or "YYYY-MM-DD HH:MM:SS")
- strings in fields where *every* value in the file is a short single token (no spaces, at most
  40 characters, no "@" and no "://"), such as roles ("user"), content types ("text"), model names
  ("gpt-4o") and IDs that link messages together. Fields are grouped by key path, with list
  indexes and ID-like keys collapsed, as in fingerprint.py.
Everything else, including any field holding even one value with a space, is replaced.

Residual risk: a field whose every value is one short word (for example a one-word title in every
conversation) is kept. Lengths of replaced strings are kept in the placeholder.

Usage: py redact.py EXPORT OUT   (prints how many strings were replaced and kept)
"""

import csv
import io
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from fingerprint import ID_KEY

TOKEN = re.compile(r"^[A-Za-z0-9_.:/+\-]{1,40}$")
TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$")


def placeholder(s):
    return f"<text {len(s)} chars>"


def _token(s):
    return bool(TOKEN.match(s)) and "://" not in s


def _keep_always(s):
    return s == "" or bool(TIMESTAMP.match(s))


def _paths(value, path, out):
    if isinstance(value, dict):
        for k, v in value.items():
            _paths(v, f"{path}.{'*' if ID_KEY.match(str(k)) else k}", out)
    elif isinstance(value, list):
        for v in value:
            _paths(v, f"{path}[]", out)
    elif isinstance(value, str) and not _keep_always(value):
        out[path].append(value)


def _rewrite(value, path, keep_paths, stats):
    if isinstance(value, dict):
        return {k: _rewrite(v, f"{path}.{'*' if ID_KEY.match(str(k)) else k}", keep_paths, stats)
                for k, v in value.items()}
    if isinstance(value, list):
        return [_rewrite(v, f"{path}[]", keep_paths, stats) for v in value]
    if isinstance(value, str):
        if _keep_always(value) or path in keep_paths:
            stats["kept"] += 1
            return value
        stats["replaced"] += 1
        return placeholder(value)
    return value


def redact_json(data):
    strings = defaultdict(list)
    _paths(data, "$", strings)
    keep_paths = {p for p, values in strings.items() if all(_token(v) for v in values)}
    stats = {"replaced": 0, "kept": 0, "kept_fields": sorted(keep_paths)}
    return _rewrite(data, "$", keep_paths, stats), stats


def redact_csv(text):
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return text, {"replaced": 0, "kept": 0, "kept_fields": []}
    header, body = rows[0], rows[1:]
    keep = []
    for i in range(len(header)):
        values = [r[i] for r in body if i < len(r) and not _keep_always(r[i])]
        keep.append(all(_token(v) for v in values))
    stats = {"replaced": 0, "kept": 0, "kept_fields": [h for h, k in zip(header, keep) if k]}
    out_rows = [header]
    for r in body:
        new = []
        for i, cell in enumerate(r):
            if _keep_always(cell) or (i < len(keep) and keep[i]):
                stats["kept"] += 1
                new.append(cell)
            else:
                stats["replaced"] += 1
                new.append(placeholder(cell))
        out_rows.append(new)
    buf = io.StringIO()
    csv.writer(buf, lineterminator="\n").writerows(out_rows)
    return buf.getvalue(), stats


def redact_file(src, dst):
    src, dst = Path(src), Path(dst)
    text = src.read_bytes().decode("utf-8-sig", errors="replace")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = None
    if data is not None:
        redacted, stats = redact_json(data)
        dst.write_text(json.dumps(redacted, ensure_ascii=False, indent=1), encoding="utf-8")
    elif src.suffix.lower() in (".csv", ".tsv") or "," in (text.splitlines() or [""])[0]:
        redacted, stats = redact_csv(text)
        dst.write_text(redacted, encoding="utf-8")
    else:
        raise ValueError(f"don't know how to redact {src.suffix or 'this file'}; refusing to show it to Droid")
    return stats


if __name__ == "__main__":
    s = redact_file(sys.argv[1], sys.argv[2])
    print(f"replaced {s['replaced']} strings, kept {s['kept']}; kept fields: {s['kept_fields']}")
