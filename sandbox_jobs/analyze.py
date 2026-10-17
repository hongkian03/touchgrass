"""F4: Droid Job 2, the Analyst.

Droid writes an analyze.py: a pandas analysis of a prompts.jsonl that finds the user's top 3 waste
patterns and writes insights.json, taking every energy, water and CO2 number from footprint.py,
which it imports and never edits.

Privacy: Droid never sees the user's prompts. It works in DROID_VIEW_DIR/analyze, which holds only our
schemas, footprint.py, a FAKE prompts.jsonl (samples/chatgpt_fake), and aggregates.json with
counts of the real data (per model, per day, per kind, regenerations, text lengths), with
Droid's default tools. We then copy its analyze.py into WORK_DIR and run it on the real
prompts.jsonl ourselves, without Droid.

On that real run we check Droid's work ourselves; any failure fails the job:
  1. footprint.py's SHA-256 is unchanged (in Droid's view and in WORK_DIR)
  2. insights.json passes our validator (lib/validate_insights.py)
  3. re-running analyze.py from scratch gives the same insights.json (ignoring generated_at)
  4. analyze.py imports footprint and has no numeric constants on lines about energy,
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
import statistics
import subprocess
import sys
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel

REPO = Path(__file__).resolve().parents[1]
load_dotenv(REPO / ".env")

from droid_runner import (  # noqa: E402
    DROID_VIEW_DIR,
    WORK_DIR,
    ensure_work_dirs,
    run_droid_job,
)

VIEW = DROID_VIEW_DIR / "analyze"  # the only folder Droid works in for this job

LIB_SRC = Path(__file__).resolve().parent / "lib"
FOOTPRINT_SRC = Path(os.environ.get("FOOTPRINT_PY", REPO / "backend" / "footprint.py"))
# The only prompts Droid ever sees: fake ones, with the same schema as the real data.
FAKE_PROMPTS = Path(__file__).resolve().parent / "samples" / "chatgpt_fake" / "prompts_example.jsonl"
PYTHON = os.environ.get("DROID_PYTHON", "py" if os.name == "nt" else "python3")
RUN_TIMEOUT = 300

# Words that mark a line as being about energy, water or carbon (matched against identifier parts).
FOOTPRINT_WORDS = {"wh", "kwh", "mwh", "watt", "watts", "energy", "joule", "joules", "water", "ml",
                   "litre", "liter", "liters", "co2", "co2e", "carbon", "emission", "emissions", "gram", "grams"}
ALLOWED_NUMBERS = {0, 1, 2, 3, 100}  # 100 for percentages; 0.0 == 0 and 1.0 == 1 match too


class AnalystSummary(BaseModel):
    patterns_checked: list[str]
    top_patterns: list[str]
    notes: str


PROMPT = f"""You are the Analyst. Write a program that finds a user's biggest sources of wasted AI energy.

Privacy: you will never see this user's real prompts. Your analyze.py will later be run on their real
data, without you, so it must work on any data that matches the schema, not just on the sample here.

Folders (relative to your current directory, which is the droid folder):
- ../output/prompts.jsonl is a FAKE sample with the same schema as the real data, one JSON object
  per line: ts, provider, model, kind (text, image or video), prompt_text, response_text,
  regenerated. Use it to develop and run your code. ../lib/schema.json describes one line.
- ../input/aggregates.json holds counts from the REAL data (exchanges, per model, per day, per kind,
  regenerations, prompt and response length statistics), so you know its shape and scale. It has
  no text.
- ../lib/ holds footprint.py, insights_schema.json, validate_insights.py and schema.json. Read only;
  never modify them.
- . (this folder) is where you write your code.

Only look at files inside this job's folders: ../input, ../lib, this folder and ../output. Never
open, list or search any other path on this machine. You may use LS, Glob, Read and Grep there.
Create and change files with your file tools (Create, Edit or ApplyPatch); never create or write
files with shell commands such as Set-Content, echo or python -c. You are
already in the droid folder, so don't cd anywhere. Run Python with `{PYTHON}` (for example
`{PYTHON} analyze.py`). Only run Python scripts in this folder or ../lib, or `{PYTHON} -m pytest` on
tests in this folder, one command at a time with no pipes or redirects. Other commands will be
refused, and a refused command ends your turn.

Write analyze.py, using pandas, that reads ../output/prompts.jsonl and writes ../output/insights.json:
1. Import footprint from ../lib by adding that folder to sys.path relative to analyze.py's own location,
   then `import footprint`. Compute EVERY energy, water and CO2 number only by calling its functions:
   footprint.energy_wh(kind, model, output_tokens) -> (low, high) Wh; footprint.water_ml(wh) -> mL;
   footprint.co2_g(wh) -> grams; footprint.compare_models(model_a, model_b, output_tokens) -> (low, high)
   percent saved. Never write a numeric energy, water or carbon constant in your code. Estimate output
   tokens from response_text length (for example characters divided by 4); that is not a footprint number.
2. Detect these patterns: near-identical repeated questions (normalize case, punctuation and small
   wording changes), regenerate loops, very long outputs for short asks, image or video spikes, and
   time-of-day patterns. For each, estimate the energy that could have been saved (low and high Wh, from
   footprint) and pick the 3 with the biggest estimated savings. The fake sample may not contain every
   pattern, so write test_analyze.py with small synthetic rows you invent (for example the same
   question asked 4 times) and check that each detector finds its pattern; run it with pytest.
3. Make each tip specific to the data it runs on: real counts in evidence.counts, up to 3 example
   prompts in evidence.examples (each truncated to at most 80 characters), a title with the numbers,
   and a one-sentence how_to_fix. No generic advice.
4. totals: number of exchanges plus energy_wh, water_ml and co2_g as low/high ranges summed over all
   exchanges, all from footprint. period: earliest and latest ts.
5. The output must be deterministic: no randomness, and don't use the current time. Set generated_at
   to the latest ts in the data (as ISO 8601), so running analyze.py twice gives identical output.
6. Match ../lib/insights_schema.json exactly. Run `{PYTHON} analyze.py`, then
   `{PYTHON} ../lib/validate_insights.py ../output/insights.json`, and fix analyze.py until it exits 0.
7. Reply with patterns_checked, top_patterns (the 3 chosen on the fake sample) and notes.

Don't ask questions; nobody is there to answer. Decide from these instructions.
"""


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clear(folder):
    for p in folder.iterdir():
        shutil.rmtree(p) if p.is_dir() else p.unlink()


def copy_lib(root=WORK_DIR):
    for name in ("insights_schema.json", "validate_insights.py", "schema.json"):
        shutil.copy2(LIB_SRC / name, root / "lib" / name)
    shutil.copy2(FOOTPRINT_SRC, root / "lib" / "footprint.py")


def aggregates(prompts):
    """Counts of the real data for Droid. Numbers and model names only, never text."""
    rows = [json.loads(line) for line in prompts.read_text(encoding="utf-8").splitlines() if line.strip()]

    def stats(values):
        if not values:
            return {}
        s = sorted(values)
        return {"min": s[0], "median": statistics.median(s), "p90": s[int(0.9 * (len(s) - 1))], "max": s[-1]}

    return {
        "exchanges": len(rows),
        "per_model": dict(Counter(r["model"] or "(unknown)" for r in rows)),
        "per_provider": dict(Counter(r["provider"] for r in rows)),
        "per_kind": dict(Counter(r["kind"] for r in rows)),
        "per_day": dict(sorted(Counter(r["ts"][:10] for r in rows).items())),
        "regenerated": sum(r["regenerated"] for r in rows),
        "prompt_chars": stats([len(r["prompt_text"]) for r in rows]),
        "response_chars": stats([len(r["response_text"]) for r in rows]),
    }


def build_droid_view():
    """A fresh Droid view with our lib files, the fake prompts, and aggregates of the real ones."""
    ensure_work_dirs(VIEW)
    for name in ("input", "lib", "droid", "output"):
        clear(VIEW / name)
    copy_lib(VIEW)
    shutil.copy2(FAKE_PROMPTS, VIEW / "output" / "prompts.jsonl")
    agg = aggregates(WORK_DIR / "output" / "prompts.jsonl")
    (VIEW / "input" / "aggregates.json").write_text(json.dumps(agg, indent=1), encoding="utf-8")
    print(f"Droid view: fake prompts ({FAKE_PROMPTS.name}) and aggregates of {agg['exchanges']} real exchanges")


def run_on_real():
    """Run WORK_DIR/droid/analyze.py on the real prompts.jsonl, without Droid. Returns (ok, why)."""
    try:
        proc = subprocess.run([sys.executable, "analyze.py"], cwd=WORK_DIR / "droid",
                              capture_output=True, text=True, timeout=RUN_TIMEOUT)
    except subprocess.TimeoutExpired:
        return False, "analyze.py timed out"
    if proc.returncode != 0:
        return False, f"analyze.py exited {proc.returncode}: {proc.stderr.strip()[-300:]}"
    return True, "ran"


def check_schema(insights):
    proc = subprocess.run([sys.executable, str(WORK_DIR / "lib" / "validate_insights.py"), str(insights)],
                          capture_output=True, text=True)
    return proc.returncode == 0, proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else "no output"


def without_generated_at(data):
    return {k: v for k, v in data.items() if k != "generated_at"}


def check_rerun(insights):
    """Re-run analyze.py from scratch and compare its output with the original."""
    script = WORK_DIR / "droid" / "analyze.py"
    if not script.is_file():
        return False, "droid/analyze.py not found"
    original = json.loads(insights.read_text(encoding="utf-8"))
    saved = insights.with_name("insights.first_run.json")
    insights.replace(saved)
    ran, why = run_on_real()
    if not ran or not insights.is_file():
        saved.replace(insights)
        return False, f"re-run failed: {why}"
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


def checks(footprint_ok):
    insights = WORK_DIR / "output" / "insights.json"
    results = {}
    real = sha256(WORK_DIR / "lib" / "footprint.py")
    results["footprint_unchanged"] = (footprint_ok and real == sha256(FOOTPRINT_SRC), f"sha256 {real[:12]}")
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
    print("\nOur independent checks on the real data (run by analyze.py, not Droid):")
    for name, (ok, detail) in results.items():
        print(f"  {'PASS' if ok else 'FAIL'}  {name}: {detail}")
    show_tips()
    return all(ok for ok, _ in results.values())


async def main():
    ensure_work_dirs()
    if "--checks-only" in sys.argv[1:]:
        # Re-check an existing run without calling Droid: footprint.py must still match our source copy.
        ok = report(checks(footprint_ok=True))
        print(f"\nCHECKS {'PASSED' if ok else 'FAILED'}")
        return 0 if ok else 1
    if not (WORK_DIR / "output" / "prompts.jsonl").is_file():
        print("no work/output/prompts.jsonl; run the Ingestor first")
        return 1
    (WORK_DIR / "output" / "insights.json").unlink(missing_ok=True)
    clear(WORK_DIR / "droid")
    build_droid_view()
    view_footprint = VIEW / "lib" / "footprint.py"
    footprint_hash = sha256(view_footprint)

    job = await run_droid_job("analyze", PROMPT, output_model=AnalystSummary, timeout=900,
                              work_dir=VIEW)
    print(f"\nDroid: success={job.success} subtype={job.subtype} seconds={job.duration} "
          f"factory_credits={job.factory_credits}")
    if job.error:
        print(f"error: {job.error}")
    if job.rejected:
        print(f"rejected actions: {job.rejected}")
    print(f"Droid's summary: {job.structured}")
    view_footprint_ok = sha256(view_footprint) == footprint_hash

    # Now the real data, without Droid: our copy of its analyze.py, our lib files.
    droid_script = VIEW / "droid" / "analyze.py"
    if droid_script.is_file():
        copy_lib()
        shutil.copy2(droid_script, WORK_DIR / "droid" / "analyze.py")
        ran, why = run_on_real()
        print(f"\nanalyze.py on the real data (run by analyze.py, not Droid): {why}")
    else:
        print("\nDroid did not write analyze.py")
    # Our checks decide, not how Droid's turn ended; a changed protected folder always fails.
    ok = report(checks(view_footprint_ok)) and not job.tampered
    if ok and not job.success:
        print(f"note: Droid's turn ended as {job.subtype}, but the analyze.py it wrote passes our checks")
    print(f"\nANALYZE {'PASSED' if ok else 'FAILED'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
