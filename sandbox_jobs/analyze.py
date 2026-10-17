"""F4: Droid Job 2, the Analyst.

Droid writes WORK_DIR/droid/analyze.py, a pandas analysis of WORK_DIR/output/prompts.jsonl that
finds this user's top 3 waste patterns and writes WORK_DIR/output/insights.json. Every energy,
water and CO2 number must come from footprint.py, which Droid imports and never edits.

After Droid finishes we check its work ourselves; any failure fails the job:
  1. footprint.py's SHA-256 is unchanged
  2. insights.json passes our validator (lib/validate_insights.py)
  3. re-running droid/analyze.py from scratch gives the same insights.json (ignoring generated_at)
  4. droid/analyze.py imports footprint and has no numeric constants on lines about energy,
     water or carbon

Usage: py sandbox_jobs/analyze.py                 (needs WORK_DIR/output/prompts.jsonl from the Ingestor)
       py sandbox_jobs/analyze.py --checks-only   (re-run our checks on the last run, no Droid call)
"""

import ast
import asyncio
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel

REPO = Path(__file__).resolve().parents[1]
load_dotenv(REPO / ".env")

from droid_runner import WORK_DIR, ensure_work_dirs, run_droid_job  # noqa: E402

LIB_SRC = Path(__file__).resolve().parent / "lib"
FOOTPRINT_SRC = Path(os.environ.get("FOOTPRINT_PY", REPO / "backend" / "footprint.py"))
PYTHON = os.environ.get("DROID_PYTHON", "py" if os.name == "nt" else "python3")
RERUN_TIMEOUT = 300

# Words that mark a line as being about energy, water or carbon (matched against identifier parts).
FOOTPRINT_WORDS = {"wh", "kwh", "mwh", "watt", "watts", "energy", "joule", "joules", "water", "ml",
                   "litre", "liter", "liters", "co2", "co2e", "carbon", "emission", "emissions", "gram", "grams"}
ALLOWED_NUMBERS = {0, 1, 2, 3, 100}  # 100 for percentages; 0.0 == 0 and 1.0 == 1 match too


class AnalystSummary(BaseModel):
    patterns_checked: list[str]
    top_patterns: list[str]
    notes: str


PROMPT = f"""You are the Analyst. Find this user's biggest sources of wasted AI energy and write insights.json.

Folders (relative to your current directory, which is the droid folder):
- ../output/prompts.jsonl holds the user's exchanges, one JSON object per line: ts, provider, model,
  kind (text, image or video), prompt_text, response_text, regenerated. Read it only from your scripts.
- ../lib/ holds footprint.py, insights_schema.json and validate_insights.py. Read only; never modify them.
- . (this folder) is where you write your code.

To list, search or read files, use your file tools (LS, Glob, Read), never shell commands. You are
already in the droid folder, so don't cd anywhere. Run Python with `{PYTHON}` (for example
`{PYTHON} analyze.py`). Only run Python scripts in this folder or ../lib, or `{PYTHON} -m pytest` on
tests in this folder, one command at a time with no pipes or redirects. Other commands will be
refused, and a refused command ends your turn. The prompts are private: when exploring, print
counts and short truncated snippets only, never whole prompts or responses.

Write analyze.py, using pandas, that reads ../output/prompts.jsonl and writes ../output/insights.json:
1. Import footprint from ../lib by adding that folder to sys.path relative to analyze.py's own location,
   then `import footprint`. Compute EVERY energy, water and CO2 number only by calling its functions:
   footprint.energy_wh(kind, model, output_tokens) -> (low, high) Wh; footprint.water_ml(wh) -> mL;
   footprint.co2_g(wh) -> grams; footprint.compare_models(model_a, model_b, output_tokens) -> (low, high)
   percent saved. Never write a numeric energy, water or carbon constant in your code. Estimate output
   tokens from response_text length (for example characters divided by 4); that is not a footprint number.
2. Look for these patterns: near-identical repeated questions (normalize case, punctuation and small
   wording changes), regenerate loops, very long outputs for short asks, image or video spikes, and
   time-of-day patterns. For each, estimate the energy that could have been saved (low and high Wh, from
   footprint) and pick the 3 with the biggest estimated savings for this user.
3. Make each tip specific to this user's data: put the real counts in evidence.counts, up to 3 example
   prompts in evidence.examples (each truncated to at most 80 characters), and give a title with the
   numbers and a one-sentence how_to_fix. No generic advice.
4. totals: number of exchanges plus energy_wh, water_ml and co2_g as low/high ranges summed over all
   exchanges, all from footprint. period: earliest and latest ts.
5. The output must be deterministic: no randomness, and don't use the current time. Set generated_at
   to the latest ts in the data (as ISO 8601), so running analyze.py twice gives identical output.
6. Match ../lib/insights_schema.json exactly. Run `{PYTHON} analyze.py`, then
   `{PYTHON} ../lib/validate_insights.py ../output/insights.json`, and fix analyze.py until it exits 0.
7. Reply with patterns_checked, top_patterns (the 3 chosen) and notes.

Don't ask questions; nobody is there to answer. Decide from these instructions.
"""


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def copy_lib():
    for name in ("insights_schema.json", "validate_insights.py"):
        shutil.copy2(LIB_SRC / name, WORK_DIR / "lib" / name)
    shutil.copy2(FOOTPRINT_SRC, WORK_DIR / "lib" / "footprint.py")


def check_schema(insights):
    proc = subprocess.run([sys.executable, str(WORK_DIR / "lib" / "validate_insights.py"), str(insights)],
                          capture_output=True, text=True)
    return proc.returncode == 0, proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else "no output"


def without_generated_at(data):
    return {k: v for k, v in data.items() if k != "generated_at"}


def check_rerun(insights):
    """Re-run Droid's analyze.py from scratch and compare its output with the original."""
    script = WORK_DIR / "droid" / "analyze.py"
    if not script.is_file():
        return False, "droid/analyze.py not found"
    original = json.loads(insights.read_text(encoding="utf-8"))
    saved = insights.with_name("insights.first_run.json")
    insights.replace(saved)
    try:
        proc = subprocess.run([sys.executable, "analyze.py"], cwd=WORK_DIR / "droid",
                              capture_output=True, text=True, timeout=RERUN_TIMEOUT)
    except subprocess.TimeoutExpired:
        saved.replace(insights)
        return False, "re-run timed out"
    if proc.returncode != 0 or not insights.is_file():
        saved.replace(insights)
        return False, f"re-run exited {proc.returncode}"
    again = json.loads(insights.read_text(encoding="utf-8"))
    saved.unlink()
    same = without_generated_at(original) == without_generated_at(again)
    return same, "identical output" if same else "re-run produced different insights"


def _footprint_call_args(tree):
    """ids of number literals passed directly as arguments to footprint.<fn>(...): inputs, not outputs."""
    ok = set()
    for node in ast.walk(tree):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and isinstance(node.func.value, ast.Name) and node.func.value.id == "footprint"):
            for arg in [*node.args, *(k.value for k in node.keywords)]:
                if isinstance(arg, ast.Constant):
                    ok.add(id(arg))
    return ok


def scan_constants(script):
    """Number literals on lines that talk about energy, water or carbon, and the footprint import.

    Allowed: 0-3, 100 (percentages), and literals passed straight into a footprint call (such as an
    output-token count). Anything else on such a line is reported as a possible hard-coded constant.
    """
    source = script.read_text(encoding="utf-8")
    lines = source.splitlines()
    tree = ast.parse(source)
    inputs = _footprint_call_args(tree)
    flagged = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Constant) and type(node.value) in (int, float)) or id(node) in inputs:
            continue
        if node.value in ALLOWED_NUMBERS:
            continue
        line = lines[node.lineno - 1]
        words = {part for word in re.findall(r"[a-z0-9_]+", line.lower()) for part in word.split("_")}
        if words & FOOTPRINT_WORDS:
            flagged.append(f"line {node.lineno}: {node.value!r} in `{line.strip()[:100]}`")
    imports = bool(re.search(r"^\s*(import\s+footprint\b|from\s+footprint\s+import\b)", source, re.M))
    return flagged, imports


def checks(footprint_hash_before):
    insights = WORK_DIR / "output" / "insights.json"
    results = {}
    after = sha256(WORK_DIR / "lib" / "footprint.py")
    results["footprint_unchanged"] = (after == footprint_hash_before, f"sha256 {after[:12]}")
    if not insights.is_file():
        results["schema_valid"] = (False, "no insights.json")
        results["rerun_identical"] = (False, "no insights.json")
    else:
        results["schema_valid"] = check_schema(insights)
        results["rerun_identical"] = check_rerun(insights)
    script = WORK_DIR / "droid" / "analyze.py"
    if script.is_file():
        flagged, imports = scan_constants(script)
        ok = imports and not flagged
        detail = ("imports footprint, no footprint constants" if ok else
                  "; ".join((["does not import footprint"] if not imports else []) + flagged))
        results["no_hardcoded_constants"] = (ok, detail)
    else:
        results["no_hardcoded_constants"] = (False, "droid/analyze.py not found")
    return results


def show_tips():
    insights = WORK_DIR / "output" / "insights.json"
    if not insights.is_file():
        return
    data = json.loads(insights.read_text(encoding="utf-8"))
    t = data.get("totals", {})
    print(f"\ntotals: {t.get('exchanges')} exchanges, energy {t.get('energy_wh')} Wh, "
          f"water {t.get('water_ml')} mL, co2 {t.get('co2_g')} g")
    for i, tip in enumerate(data.get("tips", []), start=1):
        s = tip.get("estimated_savings", {}).get("energy_wh", {})
        print(f"{i}. [{tip.get('pattern')}] {tip.get('title')}")
        print(f"   saves {s.get('low')}-{s.get('high')} Wh; counts {tip.get('evidence', {}).get('counts')}")
        print(f"   fix: {tip.get('how_to_fix')}")


def report(results):
    print("\nOur independent checks (run by analyze.py, not Droid):")
    for name, (ok, detail) in results.items():
        print(f"  {'PASS' if ok else 'FAIL'}  {name}: {detail}")
    show_tips()
    return all(ok for ok, _ in results.values())


async def main():
    ensure_work_dirs()
    if "--checks-only" in sys.argv[1:]:
        # Re-check an existing run without calling Droid: footprint.py must still match our source copy.
        ok = report(checks(sha256(FOOTPRINT_SRC)))
        print(f"\nCHECKS {'PASSED' if ok else 'FAILED'}")
        return 0 if ok else 1
    if not (WORK_DIR / "output" / "prompts.jsonl").is_file():
        print("no work/output/prompts.jsonl; run the Ingestor first")
        return 1
    copy_lib()
    (WORK_DIR / "output" / "insights.json").unlink(missing_ok=True)
    footprint_hash = sha256(WORK_DIR / "lib" / "footprint.py")

    job = await run_droid_job("analyze", PROMPT, output_model=AnalystSummary, timeout=900)
    print(f"\nDroid: success={job.success} subtype={job.subtype} seconds={job.duration} "
          f"factory_credits={job.factory_credits}")
    if job.error:
        print(f"error: {job.error}")
    if job.rejected:
        print(f"rejected actions: {job.rejected}")
    print(f"Droid's summary: {job.structured}")

    ok = report(checks(footprint_hash)) and job.success
    print(f"\nANALYZE {'PASSED' if ok else 'FAILED'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
