"""Break chosen selectors in a working adapter, to simulate ChatGPT changing its page.

Replaces each chosen selector with a plausible-looking but wrong one. The version is left as is;
bumping it is the repair's job.

Usage: py break_adapter.py ADAPTER [--keys prompt_box send_button] [--out broken.json]
       (default keys: prompt_box send_button; default out: <adapter>.broken.json)
"""

import argparse
import json
from pathlib import Path

# Look like real ChatGPT selectors, but point at attributes the page doesn't have.
DECOYS = {
    "prompt_box": ["textarea[data-testid='composer-input']", "#prompt-input", "div[aria-label='Message ChatGPT']"],
    "send_button": ["button[data-testid='composer-send']", "button[aria-label='Submit message']"],
    "model_name": ["[data-testid='model-switcher-label']", "button[aria-label='Choose model'] span"],
    "response": ["div[data-message-author='assistant'] .markdown", "[data-testid='assistant-message']"],
    "regenerate_button": ["button[data-testid='regenerate-response']", "button[aria-label='Retry']"],
    "stop_button": ["button[data-testid='stop-generating']", "button[aria-label='Stop']"],
}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("adapter", type=Path)
    ap.add_argument("--keys", nargs="+", default=["prompt_box", "send_button"])
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()

    adapter = json.loads(args.adapter.read_text(encoding="utf-8"))
    selectors = adapter["selectors"]
    for key in args.keys:
        if key not in selectors:
            raise SystemExit(f"adapter has no selector {key!r}; has {sorted(selectors)}")
        old = selectors[key]
        options = DECOYS.get(key, [f"[data-testid='{key.replace('_', '-')}-v2']"])
        selectors[key] = next(d for d in options + [old + ".moved"] if d != old)
        print(f"{key}: {old}  ->  {selectors[key]}")

    out = args.out or args.adapter.with_name(args.adapter.stem + ".broken.json")
    out.write_text(json.dumps(adapter, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
