"""F4 test: do the Analyst's numbers really come from footprint.py?

Copies Droid's droid/analyze.py, output/prompts.jsonl and lib/ into a temporary work folder, doubles
footprint ranges in that copy only, re-runs Droid's script there (no Droid call, no credits), and
compares the savings and totals with a baseline run. If the numbers come from footprint.py, savings
that depend on a doubled range double too.

Scenarios:
  one range: TEXT_WH_PER_1K_TOKENS["medium"] (the class gpt-4o falls in) doubled
  all ranges: every text, image and video energy range doubled
These patch the placeholder footprint.py's tables, so update them when the real model lands.

Usage: py sandbox_jobs/check_footprint_sensitivity.py
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from droid_runner import WORK_DIR

SCENARIOS = {
    "one range (medium text models)":
        'TEXT_WH_PER_1K_TOKENS["medium"] = tuple(2 * x for x in TEXT_WH_PER_1K_TOKENS["medium"])\n',
    "all energy ranges":
        "TEXT_WH_PER_1K_TOKENS = {k: tuple(2 * x for x in v) for k, v in TEXT_WH_PER_1K_TOKENS.items()}\n"
        "IMAGE_WH = tuple(2 * x for x in IMAGE_WH)\nVIDEO_WH = tuple(2 * x for x in VIDEO_WH)\n",
}


def run_copy(patch):
    tmp = Path(tempfile.mkdtemp(prefix="footprint_check_"))
    try:
        for name in ("droid", "lib", "output"):
            (tmp / name).mkdir()
        shutil.copy2(WORK_DIR / "droid" / "analyze.py", tmp / "droid" / "analyze.py")
        shutil.copy2(WORK_DIR / "output" / "prompts.jsonl", tmp / "output" / "prompts.jsonl")
        for p in (WORK_DIR / "lib").iterdir():
            if p.is_file():
                shutil.copy2(p, tmp / "lib" / p.name)
        if patch:
            with (tmp / "lib" / "footprint.py").open("a", encoding="utf-8") as f:
                f.write("\n# sensitivity test patch\n" + patch)
        proc = subprocess.run([sys.executable, "analyze.py"], cwd=tmp / "droid",
                              capture_output=True, text=True, timeout=300)
        if proc.returncode != 0:
            raise SystemExit(f"analyze.py failed in the copy (exit {proc.returncode}): {proc.stderr[-500:]}")
        return json.loads((tmp / "output" / "insights.json").read_text(encoding="utf-8"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def ratio(new, old):
    return None if not old else round(new / old, 3)


def main():
    base = run_copy(None)
    base_tips = {t["id"]: t for t in base["tips"]}
    all_doubled = True
    for name, patch in SCENARIOS.items():
        new = run_copy(patch)
        print(f"\n== {name}")
        tb, tn = base["totals"]["energy_wh"], new["totals"]["energy_wh"]
        print(f"  totals.energy_wh: low x{ratio(tn['low'], tb['low'])}, high x{ratio(tn['high'], tb['high'])}")
        for tip in new["tips"]:
            old = base_tips.get(tip["id"])
            if old is None:
                print(f"  {tip['id']}: new tip in the top 3 (ranking changed)")
                continue
            sb, sn = old["estimated_savings"]["energy_wh"], tip["estimated_savings"]["energy_wh"]
            lo, hi = ratio(sn["low"], sb["low"]), ratio(sn["high"], sb["high"])
            print(f"  {tip['id']} [{tip['pattern']}]: savings low x{lo}, high x{hi}")
            if name == "all energy ranges" and (lo, hi) != (2.0, 2.0):
                all_doubled = False
        if name == "all energy ranges":
            all_doubled &= (ratio(tn["low"], tb["low"]), ratio(tn["high"], tb["high"])) == (2.0, 2.0)
    print(f"\ndoubling every footprint range doubled every savings number and the totals: {all_doubled}")
    return 0 if all_doubled else 1


if __name__ == "__main__":
    sys.exit(main())
