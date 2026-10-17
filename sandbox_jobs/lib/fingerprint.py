"""Structure fingerprint of a chat export, used as the parser cache key. Ours; Droid never edits it.

Built from structure only, never values, so the fingerprint holds no private text:
- JSON: sorted key paths with the value types seen at each path, from a sample of list items.
  Keys that look like IDs (UUIDs, hex, numbers) collapse to "*", and lists to "[]", so two
  exports in the same format get the same fingerprint however many conversations they hold.
- CSV: normalized header names and the column count.
- anything else: the file extension.

Usage: py fingerprint.py EXPORT   (prints the fingerprint)
"""

import csv
import hashlib
import json
import re
import sys
from pathlib import Path

SAMPLE_ITEMS = 50  # list items inspected per list
# Deep enough to tell formats apart (e.g. ChatGPT's $[].mapping.*.message.author), shallow enough
# that optional details inside a message (image metadata, new fields) don't split one format.
MAX_DEPTH = 5
ID_KEY = re.compile(r"^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|\d+|[A-Za-z]+[-_][0-9a-f-]{8,})$", re.I)


def _type(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    return {str: "string", list: "list", dict: "object"}[type(value)]


def _walk(value, path, paths, depth):
    paths.setdefault(path, set()).add(_type(value))
    if depth >= MAX_DEPTH:
        return
    if isinstance(value, dict):
        for key, child in value.items():
            name = "*" if ID_KEY.match(str(key)) else str(key)
            _walk(child, f"{path}.{name}", paths, depth + 1)
    elif isinstance(value, list):
        for child in value[:SAMPLE_ITEMS]:
            _walk(child, f"{path}[]", paths, depth + 1)


def describe(path):
    """The structure the fingerprint hashes, as text (contains no values)."""
    path = Path(path)
    raw = path.read_bytes()
    text = raw.decode("utf-8-sig", errors="replace")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = None
    if data is not None:
        paths = {}
        _walk(data, "$", paths, 0)
        return "json\n" + "\n".join(f"{p} {','.join(sorted(t))}" for p, t in sorted(paths.items()))
    first_line = text.splitlines()[0] if text.strip() else ""
    if path.suffix.lower() in (".csv", ".tsv") or "," in first_line:
        try:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
            delimiter = dialect.delimiter
        except csv.Error:
            delimiter = ","
        header = next(csv.reader([first_line], delimiter=delimiter))
        names = [re.sub(r"\s+", "_", h.strip().lower()) for h in header]
        return f"csv delimiter={delimiter!r} columns={len(names)}\n" + "\n".join(names)
    return f"other {path.suffix.lower()}"


def fingerprint(path):
    return hashlib.sha256(describe(path).encode()).hexdigest()[:16]


if __name__ == "__main__":
    print(fingerprint(sys.argv[1]))
