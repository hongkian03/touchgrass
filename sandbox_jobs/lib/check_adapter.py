"""Our own adapter checker (not written by Droid).

Verifies an adapter's CSS selectors against a saved page snapshot with BeautifulSoup:
  prompt_box   matches exactly one element, and its text contains the expected prompt
  send_button  matches at least one element
  model_name   matches, with non-empty text equal to the expected model (if given)
  response     matches at least one element (skipped if expected.json says has_responses: false)
Prints PASS/FAIL per selector and exits 1 on any failure.

Usage: py check_adapter.py --adapter adapter.json --snapshot page.html [--expected expected.json]
       (--expected defaults to expected.json next to the snapshot)

expected.json: {"prompt": "PROMPTPRINT TEST PROMPT", "model": "GPT-4o", "has_responses": true}
"""

import argparse
import json
import sys
from pathlib import Path

from bs4 import BeautifulSoup

REQUIRED_KEYS = ["prompt_box", "send_button", "model_name", "response"]


def text_of(el):
    # Textareas keep the draft as their text; contenteditable divs (ChatGPT's composer) as child text.
    return " ".join(el.get_text(" ", strip=True).split())


def select(soup, selector):
    try:
        return soup.select(selector), None
    except Exception as e:  # soupsieve raises on invalid CSS
        return [], f"invalid selector ({type(e).__name__})"


def check(adapter, soup, expected):
    selectors = adapter.get("selectors", {})
    results = {}

    for key in REQUIRED_KEYS:
        sel = selectors.get(key)
        if not isinstance(sel, str) or not sel.strip():
            results[key] = (False, "missing from adapter")
            continue
        if key == "response" and expected.get("has_responses") is False:
            results[key] = (True, "skipped (page has no responses)")
            continue

        found, err = select(soup, sel)
        if err:
            results[key] = (False, err)
        elif key == "prompt_box":
            want = expected.get("prompt")
            if len(found) != 1:
                results[key] = (False, f"matched {len(found)} elements, need exactly 1")
            elif want and want not in text_of(found[0]):
                results[key] = (False, "matched, but text does not contain the expected prompt")
            else:
                results[key] = (True, "matched 1, prompt text found" if want else "matched 1")
        elif key == "model_name":
            want = expected.get("model")
            got = text_of(found[0]) if found else ""
            if not found:
                results[key] = (False, "matched 0 elements")
            elif not got:
                results[key] = (False, "matched, but text is empty")
            elif want and got != want:
                results[key] = (False, f"text is {got!r}, expected {want!r}")
            else:
                results[key] = (True, f"text {got!r}")
        else:
            results[key] = (bool(found), f"matched {len(found)}")

    return results


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--adapter", required=True, type=Path)
    ap.add_argument("--snapshot", required=True, type=Path)
    ap.add_argument("--expected", type=Path)
    args = ap.parse_args()

    expected_path = args.expected or args.snapshot.parent / "expected.json"
    expected = json.loads(expected_path.read_text(encoding="utf-8")) if expected_path.is_file() else {}
    adapter = json.loads(args.adapter.read_text(encoding="utf-8"))
    soup = BeautifulSoup(args.snapshot.read_text(encoding="utf-8"), "html.parser")

    print(f"adapter: {args.adapter} (site={adapter.get('site')}, version={adapter.get('version')})")
    results = check(adapter, soup, expected)
    for key, (ok, detail) in results.items():
        print(f"  {'PASS' if ok else 'FAIL'}  {key}: {detail}  [{adapter.get('selectors', {}).get(key)}]")

    ok = all(ok for ok, _ in results.values())
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
