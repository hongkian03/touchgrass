# Prompt Print: Factory Milestones

Oct 16, 2026 · @Nico

## How this fits together

You build and test all three Droid jobs on your laptop first, in a scratch folder laid out exactly like the sandbox will be. The Daytona doc then moves that same folder into a sandbox with almost no code changes.

**Why local first:** a broken Droid prompt and a broken sandbox look the same from the outside. Getting the jobs right locally means that when something fails in Daytona, you know it's the sandbox.

**The work folder** (same layout locally and in the sandbox):

| Path | What's in it | Who writes it |
| --- | --- | --- |
| `work/input/` | The uploaded export, or page snapshot + broken adapter | Your code |
| `work/lib/` | `footprint.py`, `schema.json`, validators | Your code, read-only to Droid |
| `work/droid/` | Whatever Droid writes: `parser.py`, tests, analysis scripts | Droid |
| `work/output/` | `prompts.jsonl`, `insights.json`, new adapter JSON | Droid's scripts |
| `work/logs/` | Droid's streamed messages, one file per job | Your code |

Locally this lives at `HackHarvard/work/`. Add `work/` to `.gitignore` so nobody commits real chat history.

**The one safety rule:** Droid edits files and runs commands. Always point it at `work/`, never the repo root. Locally, use a permission handler that only approves running Python inside `work/`. In Daytona, the sandbox is the boundary.

**How Droid is called** (from the SDK docs, so Claude Code doesn't have to guess):

- `await run(prompt, cwd=..., model=..., timeout=..., config=SessionConfig(...), output=SomePydanticModel)` for one-shot jobs.
- `Session(...)` with `session.stream(prompt)` when you need follow-up turns or live log streaming.
- Autonomy levels: `LOW` allows edits and read-only commands, `MEDIUM` allows reversible commands, `HIGH` allows any command. Jobs that run tests need more than `LOW`.
- `output=` a Pydantic model makes Droid return validated structured data. Use it for job summaries.
- Auth: the SDK reads `FACTORY_API_KEY` from the environment.

**Order and timing:** F0 to F2 tonight. F3 to F6 Saturday. F7 starts tonight (the plan says draft the README Friday). If you run short, the plan says Job 3 (F5) is never cut, so do F5 before F4 if needed.

**Loop for each milestone:** paste the prompt into Claude Code, read what it wrote, run the test yourself, commit if it passes, send me the error with the milestone number if it doesn't.

## F0. Install droid and prove it answers

**Goal:** Python on your laptop can call Droid and get a reply. Fifteen minutes, done by hand, no Claude Code needed.

**Steps (PowerShell in Cursor):**

1. Check Python is 3.10 or newer: `python --version`
2. Install the droid CLI:

```powershell
irm https://app.factory.ai/cli/windows | iex
```

3. Close the terminal, open a new one, check it's on PATH: `droid --version`
4. Get an API key from your Factory account settings (API keys page). Ask the Factory sponsor about hackathon credits before paying for anything.
5. Put the key in a `.env` file at the repo root (already gitignored from the scaffold):

```
FACTORY_API_KEY=fk-your-key-here
```

6. Set it for this terminal session too, so the CLI test works:

```powershell
$env:FACTORY_API_KEY = "fk-your-key-here"
```

7. CLI smoke test:

```powershell
droid exec --auto low "Reply with exactly: OK"
```

8. Python SDK:

```powershell
pip install droid-sdk python-dotenv
```

**Prompt for Claude Code (the Python smoke test):**

```
Create sandbox_jobs/smoke_droid.py. It loads FACTORY_API_KEY from the repo-root .env with python-dotenv, then uses the droid_sdk package: await run("Reply with exactly: OK", timeout=60). Print result.success, result.subtype, result.text, and result.usage.factory_credits if usage exists. Catch DroidError subclasses and print a clear message for each likely cause: droid not on PATH, missing API key, timeout. Use asyncio.run. Don't put the key in the code.
```

Run it: `python sandbox_jobs/smoke_droid.py`

**Done when:** both the CLI test and the Python script print `OK`.

**If it fails:**

- `droid` not recognized: the installer's folder isn't on PATH yet. Open a fresh terminal. If still missing, restart Cursor.
- Auth error: the key isn't set in that terminal, or has a typo. `echo $env:FACTORY_API_KEY` should print it.
- `DroidConnectionError` or process error in Python: Python can't find `droid`. Run `where.exe droid` and confirm it prints a path.
- Python is 3.9 or older: install 3.11 or 3.12 from python.org.

**Commit:** `F0: droid smoke test` (check `git status` first: `.env` must not appear).

## F1. The job runner

**Goal:** one Python function that runs any Droid job safely in the work folder, saves its log, and returns a structured result. All three jobs call it, and the Daytona doc reuses it unchanged inside the sandbox.

**Prompt for Claude Code:**

```
Create sandbox_jobs/droid_runner.py using the droid_sdk package (Factory Droid Python SDK).

- WORK_DIR comes from an environment variable, defaulting to ./work locally (inside the sandbox it will be /work). Create input/, lib/, droid/, output/, logs/ under it if missing. Add work/ to .gitignore.
- async def run_droid_job(job_name, prompt, output_model=None, timeout=600, autonomy=Autonomy.MEDIUM) -> result.
- Open a droid_sdk Session with cwd = WORK_DIR/droid, model="auto", and a SessionConfig with the given autonomy.
- Permission handler (InteractionHandlers on_permission): approve an action only if every path it touches is inside WORK_DIR/droid or WORK_DIR/output, or it's an ExecuteAction whose command runs python or pytest on files inside WORK_DIR. Reject everything else with ToolConfirmationOutcome.CANCEL and log what was rejected. Never let Droid write to WORK_DIR/lib or WORK_DIR/input.
- Stream the turn with session.stream(prompt, timeout=timeout, output=output_model). Write every message to WORK_DIR/logs/<job_name>.jsonl as one JSON line (type, short text, tool name if any, timestamp) and also print a short version to stdout, so later we can stream it to the UI.
- Return a small dataclass: success, subtype, text, structured output if any, duration in seconds, factory_credits used, and the log path.
- Catch RunTimeoutError and other DroidError subclasses and return them as a failed result instead of crashing.
- Add sandbox_jobs/try_runner.py: a test job that asks Droid to write droid/hello.py, which writes output/hello.json containing {"ok": true}, then run it. Also a second test that asks Droid to write a file into lib/, which the handler must reject.
```

**Test:**

1. `python sandbox_jobs/try_runner.py`
2. Check `work/output/hello.json` exists with `{"ok": true}`.
3. Open `work/logs/` and read the log for the first test. You should see Droid's tool calls in order.
4. Check the second test: nothing new in `work/lib/`, and the log shows a rejected action.

**Done when:** the hello job succeeds, the log file reads like a replay of what Droid did, and the write into `lib/` is blocked.

**If it fails:**

- Droid stalls or the turn ends `interrupted`: the handler rejected something Droid needed. Read the rejected action in the log and decide if the rule is too strict.
- Paths never match on Windows: compare resolved absolute paths (`Path.resolve()`), not raw strings, and watch backslashes.
- Hangs forever: the timeout isn't being passed to `stream()`.

**Commit:** `F1: shared droid job runner with path-restricted permissions`

## F2. Job 1: the Ingestor

**Goal:** drop any chat export into `work/input/`, and Droid writes a parser that turns it into `work/output/prompts.jsonl` in your fixed schema, tests it, and fixes it until it passes. Then your own validator (not Droid) confirms the output.

**Do this first, right now:** request a ChatGPT data export (ChatGPT settings, Data controls, Export data). It arrives by email and can take a while. Ask a teammate to request one too. The plan needs a real export with a few weeks of history.

**Prompt for Claude Code:**

```
Build Droid Job 1 (the Ingestor) from plan.pdf. Use run_droid_job from sandbox_jobs/droid_runner.py.

1. sandbox_jobs/lib/schema.json: JSON Schema for one line of prompts.jsonl with fields ts (ISO 8601 string), provider (string), model (string or null), kind ("text" | "image" | "video"), prompt_text (string), response_text (string), regenerated (bool). This file is ours and Droid never edits it.

2. sandbox_jobs/lib/validate_prompts.py: our own validator, not written by Droid. It checks every line of a prompts.jsonl against schema.json and prints counts: total exchanges, exchanges per model, regenerated count, image count, and any invalid lines. Exit code 1 if anything is invalid.

3. sandbox_jobs/ingest.py: copies lib/ files into WORK_DIR/lib, then calls run_droid_job("ingest", PROMPT, output_model=IngestSummary) where IngestSummary is a Pydantic model: detected_format, exchanges, models (list of str), regenerations, images, notes.

The Droid PROMPT must tell it to:
- Inspect the export in WORK_DIR/input by writing small scripts that print its structure, keys, and a few samples. Never read the whole file into the conversation, since exports can be huge and contain private text.
- Write WORK_DIR/droid/parser.py that reads the export and writes WORK_DIR/output/prompts.jsonl, one line per exchange, matching WORK_DIR/lib/schema.json exactly.
- Treat regenerated responses as separate exchanges with regenerated=true.
- Write WORK_DIR/droid/test_parser.py, run it, and fix parser.py until it passes.
- Run WORK_DIR/lib/validate_prompts.py on the output and fix the parser until it exits 0.
- Never modify anything in WORK_DIR/lib or WORK_DIR/input.
- Reply with the summary fields.

4. After Droid finishes, ingest.py runs validate_prompts.py itself and only reports success if our validator passes, regardless of what Droid claimed.

5. sandbox_jobs/samples/: a small fake ChatGPT-style export (5 conversations, one with a regenerated answer, one with an image request) for development, so we don't need real chat history to test.
```

**Test:**

1. Copy the fake sample into `work/input/`. Run `python sandbox_jobs/ingest.py`.
2. Watch the log stream: Droid should inspect, write, test, fix.
3. Open `work/output/prompts.jsonl` and read a few lines yourself.
4. Check the validator's counts match what's actually in the sample (5 conversations, 1 regeneration, 1 image).
5. When the real export arrives, clear `work/` and repeat with `conversations.json`.

**Done when:** the validator passes on both the fake sample and a real ChatGPT export, and its counts match what you know is in the file.

**If it fails:**

- Validator fails but Droid said success: that's exactly why your validator exists. Read its invalid lines and check whether the prompt explained the schema clearly.
- Regenerations missing: ChatGPT's export stores conversations as a tree where regenerated answers are sibling branches. If Droid only follows one path, tell it that in the prompt.
- Takes many minutes: normal for a first run. F3 adds caching. Note the duration for the demo.
- Droid tries to read the whole file: tighten the inspect instruction.

**Commit:** `F2: Droid Ingestor with independent validator` (never commit anything from `work/`).

## F3. Ingestor cache, other formats, Eval 2 data

**Goal:** the second upload of a known format skips Droid entirely, unknown formats (Claude export, a random CSV) still work, and you can produce the numbers for Eval 2.

**Why it matters:** Droid takes minutes. Caching makes the product usable and gives you a fast path for the demo. Eval 2 is how the Chalk teammate proves Droid's parsers are accurate, and it needs data only you can produce.

**Prompt for Claude Code:**

```
Extend the Ingestor (sandbox_jobs/ingest.py).

1. Structure fingerprint: sandbox_jobs/lib/fingerprint.py samples the input file and builds a hash from its structure only: file type, sorted key paths, and value types for JSON; header names and column count for CSV. Never include actual values, so the fingerprint contains no private text.

2. Cache: if parser_cache/<fingerprint>/parser.py exists, copy it into WORK_DIR/droid, run it, and run our validator. If the validator passes, skip Droid and report cache_hit=true. If it fails, fall back to Droid as normal. After a successful Droid run, save parser.py (not the tests, which may contain sample text) into parser_cache/<fingerprint>/. Add parser_cache/ to .gitignore.

3. Attempt tracking: from the Droid log, count how many times Droid ran the test or the validator before the final pass. Record first_try = (attempts == 1). Include attempts, first_try, cache_hit, duration, and factory_credits in the result.

4. Eval 2 mode: python sandbox_jobs/ingest.py --input <file> --no-cache --repeat 5 runs the Ingestor 5 times from a clean WORK_DIR each time and writes evals/eval2_runs.csv with one row per run: run number, success, attempts, first_try, exchanges, regenerations, images, duration, credits.

5. Add two more fake samples to sandbox_jobs/samples/: a small Claude-style export and a generic CSV with columns like timestamp, model, user_message, assistant_message.
```

**Test:**

1. Run the Ingestor on the ChatGPT sample twice. The second run should report `cache_hit=true` and finish in seconds.
2. Run it on the Claude-style sample and the CSV. Both should pass the validator with a fresh Droid run.
3. Run Eval 2 mode on the ChatGPT sample with `--repeat 2` first (saves credits), then 5 when it works.
4. Open `evals/eval2_runs.csv` and check the rows make sense.

**Done when:** cache hits work, all three formats pass the validator, and the Eval 2 CSV exists. Send the CSV path to your Chalk teammate (Person D's eval).

**If it fails:**

- Cache never hits: the fingerprint includes something that changes between runs (file size, timestamps, list lengths). Only structure should go in.
- Cache hits but output is wrong: two different formats got the same fingerprint. Add more structure to it (nested key paths).
- Eval 2 burns too many credits: plan says use 5 runs, but 3 is still an honest number if you're short. Write down which you used.

**Commit:** `F3: parser cache, multi-format samples, Eval 2 runs`

## F4. Job 2: the Analyst

**Goal:** Droid writes and runs pandas analysis over `prompts.jsonl`, finds this user's top 3 waste patterns, and writes `insights.json`. Every energy, water, and CO2 number comes from `footprint.py`, never from Droid.

**Coordinate first:** `footprint.py` belongs to Person D. Agree on its function names tonight so you aren't blocked. A workable interface:

| Function | Returns |
| --- | --- |
| `energy_wh(kind, model, output_tokens)` | `(low, high)` in Wh |
| `water_ml(wh)` | mL |
| `co2_g(wh, region=None)` | gCO2e |
| `compare_models(model_a, model_b, output_tokens)` | percent saved, low and high |

If theirs isn't ready, create a stub with these exact signatures and placeholder ranges, clearly marked as placeholders. Swap in the real one later.

**Prompt for Claude Code:**

```
Build Droid Job 2 (the Analyst) from plan.pdf, using run_droid_job.

1. Copy footprint.py into WORK_DIR/lib. Record its SHA-256 before the run and check it after. If it changed, fail the job.

2. sandbox_jobs/lib/insights_schema.json: insights.json has generated_at, period (start, end), totals (exchanges, energy_wh low/high, water_ml low/high, co2_g low/high), and tips: exactly 3 items, each with id, title, pattern (one of repeated_questions, regenerate_loops, long_output_short_ask, media_spike, time_of_day, other), evidence (counts, up to 3 example prompts each truncated to 80 characters), estimated_savings (energy_wh low/high), and how_to_fix (one sentence).

3. sandbox_jobs/analyze.py calls run_droid_job("analyze", PROMPT, output_model=AnalystSummary). The PROMPT tells Droid to:
- Write WORK_DIR/droid/analyze.py using pandas over WORK_DIR/output/prompts.jsonl.
- Look for these patterns: near-identical repeated questions, regenerate loops, very long outputs for short asks, image or video spikes, time-of-day patterns. Pick the 3 with the biggest estimated savings for this user.
- Compute every energy, water, and CO2 number only by importing and calling functions from WORK_DIR/lib/footprint.py. Never write a numeric energy, water, or carbon constant. Never edit footprint.py.
- Write WORK_DIR/output/insights.json matching WORK_DIR/lib/insights_schema.json, then validate it and fix until valid.

4. After Droid finishes, analyze.py independently: re-runs WORK_DIR/droid/analyze.py from scratch and checks it produces the same insights.json, validates against the schema, verifies footprint.py's hash, and scans droid/analyze.py for suspicious hard-coded constants near words like wh, kwh, water, co2. Report any of these as failures.

5. sandbox_jobs/run_jobs.py runs ingest then analyze in sequence, the way the backend will.
```

**Test:**

1. Run `python sandbox_jobs/run_jobs.py` on the fake ChatGPT sample. Make sure the sample has one obvious waste pattern (for example, the same question asked 4 times).
2. Open `work/output/insights.json`. Is the obvious pattern in the top 3? Are the tips specific to the data, not generic advice?
3. Edit `footprint.py` to double one range and re-run. The savings numbers should double. That proves the numbers really come from footprint.py.
4. Try the real export if it's arrived.

**Done when:** insights pass all four of your independent checks, the planted pattern is found, and changing footprint.py changes the numbers.

**If it fails:**

- Generic tips ("use AI less"): the prompt needs to demand evidence counts and example prompts for each tip.
- Numbers don't change when footprint.py changes: Droid hard-coded them. Your constant scan should catch this; make it stricter.
- Re-run gives different results: Droid's script depends on something random or on the current time. Ask it to make the analysis deterministic.

**Commit:** `F4: Droid Analyst with footprint guardrails`

## F5. Job 3: the Mechanic

**Goal:** given a saved ChatGPT page and an adapter whose selectors are broken, Droid writes a fixed adapter, and your own checker proves it finds the right elements in that page. The plan says this is never cut.

**Depends on:** the extension's adapter format (the extension owner's M1 and M4). Ask them for the current `chatgpt.json` and use the exact same keys.

**Save a page snapshot (by hand, once):**

1. Open chatgpt.com with a boring test conversation (nothing private: judges will see this).
2. Type a known prompt in the box but don't send it, for example `PROMPTPRINT TEST PROMPT`.
3. F12, Console, run: `copy(document.documentElement.outerHTML)`
4. Paste into `sandbox_jobs/samples/chatgpt_snapshot.html` and save. Also note which model is selected.

**Prompt for Claude Code:**

```
Build Droid Job 3 (the Mechanic) from plan.pdf, using run_droid_job.

1. sandbox_jobs/lib/check_adapter.py: our own checker, not written by Droid. Given an adapter JSON and a page snapshot HTML, it uses BeautifulSoup with CSS selectors to verify: the prompt box selector matches exactly one element and its text contains the expected prompt; the send button selector matches at least one element; the model name selector matches and has non-empty text equal to the expected model if provided; the response selector matches at least one element if the page has responses. It prints a pass or fail per selector and exits 1 on any failure. Expected prompt and model come from a small expected.json next to the snapshot.

2. sandbox_jobs/repair_adapter.py takes --site, --snapshot, --adapter (the broken one), and --failed (which selector keys failed). It copies the snapshot and broken adapter into WORK_DIR/input, the checker into WORK_DIR/lib, then calls run_droid_job("repair", PROMPT).

The Droid PROMPT tells it to:
- Search the snapshot HTML with small scripts (don't read the whole file into the conversation) to find the prompt box, send button, model name, and response elements.
- Prefer stable attributes (id, data-testid, aria-label, role) over class names, which change often.
- Write WORK_DIR/output/adapter.json with the same keys as the broken adapter, fixed selectors, and version incremented by 1.
- Run WORK_DIR/lib/check_adapter.py against the snapshot and fix until it passes.
- Never edit anything in WORK_DIR/lib or WORK_DIR/input.

3. After Droid finishes, repair_adapter.py runs the checker itself. Only on a pass does it publish the adapter: PUT to the backend's /adapters/{site} if that endpoint exists, otherwise write to backend/adapters/<site>.json. Print a before and after diff of the selectors.

4. sandbox_jobs/samples/break_adapter.py: takes a working adapter and replaces chosen selectors with plausible-looking but wrong ones, to simulate ChatGPT changing its page. Used for testing and the demo.
```

**Test:**

1. Run `check_adapter.py` on the working adapter and your snapshot. It must pass. If not, the checker or snapshot is wrong; fix that before involving Droid.
2. Break it: `python sandbox_jobs/samples/break_adapter.py` (prompt box and send button).
3. Run the checker on the broken one. It must fail.
4. Run `repair_adapter.py` with the broken adapter. Watch Droid search and fix.
5. Checker passes on the new adapter, version went up by 1, and it was published.
6. Time the whole repair. Write the number down for the demo script.

**Done when:** a deliberately broken adapter comes back fixed, your checker confirms it, and it's published. If the extension owner has M4 done, the open ChatGPT tab picks it up without a refresh.

**If it fails:**

- Checker passes on broken selectors: the checker is too loose. It must check the prompt text, not just that something matched.
- Droid picks class names: they'll pass on the snapshot but break tomorrow. Tighten the prompt's preference for stable attributes.
- Snapshot is huge and slow to search: strip `<script>` and `<style>` tags before handing it to Droid.
- BeautifulSoup and Chrome disagree on a selector: rare, but test the final adapter in the real extension before the demo.

**Commit:** `F5: Droid Mechanic repairs adapters, verified by checker` (commit the snapshot only if it has nothing private).

## F6. Backend triggers for all three jobs

**Goal:** the plan's rule is that Droid is triggered by a user action or a failure, never by you running a script. This milestone makes that true: an upload starts Jobs 1 and 2, a capture failure starts Job 3, and the UI can watch the logs live.

**Key design choice:** put the jobs behind an executor interface. Today it runs them locally. The Daytona doc adds a second executor that runs them in a sandbox, and nothing else in the backend changes.

**Coordinate:** `backend/main.py` is shared. Pull `main` first and add routes, don't restructure.

**Prompt for Claude Code:**

```
Wire the three Droid jobs into the FastAPI backend. Keep all existing routes.

1. backend/executor.py: an abstract JobExecutor with run_ingest_and_analyze(export_bytes, filename, job_id) and run_repair(site, snapshot_html, broken_adapter, failed_keys, job_id). Implement LocalExecutor, which calls the existing sandbox_jobs scripts with a fresh WORK_DIR per job (work/jobs/<job_id>/). Choose the executor from an EXECUTOR environment variable (default "local"), so a DaytonaExecutor can be added later.

2. Job tracking in SQLite: jobs table with job_id, type (ingest, repair), status (queued, running, succeeded, failed), created_at, finished_at, summary JSON, error.

3. Routes:
- POST /upload: multipart file upload. Create a job, run ingest then analyze in a background task, return {job_id} immediately.
- GET /jobs/{job_id}: status and summary.
- GET /jobs/{job_id}/logs: Server-Sent Events that stream new lines from the job's Droid log file as they're written, ending when the job finishes. The dashboard will show this live.
- GET /insights/latest: the latest insights.json.
- POST /adapter-failure: body {site, failed_keys, adapter_version, snapshot_html}. Starts a repair job. If a repair for that site is already running, return its job_id instead of starting another. Ignore reports for an adapter version older than the current one.

4. Privacy in local mode: after a job finishes, delete its input export from work/jobs/<job_id>/input. Never log prompt or response text.

5. Run only one Droid job at a time locally (an asyncio lock), queue the rest.
```

**Test:**

1. Start the backend. Open `http://localhost:8000/docs`.
2. Use the docs page to POST the fake ChatGPT sample to `/upload`. Copy the job ID.
3. In a new Chrome tab, open `http://localhost:8000/jobs/<job_id>/logs`. Lines should appear as Droid works.
4. When done, check `/jobs/<job_id>` says succeeded and `/insights/latest` returns the insights.
5. Check `work/jobs/<job_id>/input` is empty.
6. POST to `/adapter-failure` with the broken adapter and your snapshot. Check a repair job runs and publishes the fix. POST the same failure twice quickly: only one repair should run.

**Done when:** every job can be started from an HTTP call, logs stream live, the export is deleted afterward, and duplicate failure reports don't start duplicate repairs.

**If it fails:**

- Upload returns only after Droid finishes: the job isn't running as a background task.
- Log stream shows nothing until the end: the runner buffers output. Flush each log line as it's written.
- Second request hangs while a job runs: a blocking call is inside an async route. Run the jobs off the event loop.

**Commit:** `F6: backend triggers, job status, live log stream`. Merge to `main` after this so the dashboard teammate can build on `/upload` and the log stream.

## F7. README "Where Droid works" and demo hardening

**Goal:** Factory requires the README to explain where and how Droid is used. The plan says draft it Friday night, then update it as jobs land. Then make sure nothing in the Factory demo depends on luck.

**Prompt for Claude Code (README, run tonight and again after F6):**

```
Update README.md's "Where Droid works" section from plan.pdf and the actual code. For each of the three jobs (Ingestor, Analyst, Mechanic) write: what triggers it (a user upload, after ingest, a capture failure), what Droid does, what it outputs, how we verify Droid's work independently (our validator, footprint hash check, adapter checker), and links to the exact files and functions that call the Droid SDK. Add a short "Guardrails" list: path-restricted permissions, read-only lib folder, footprint.py never edited, independent validation before anything is published. Only describe what is actually implemented; mark anything unfinished as planned.
```

**Demo hardening checklist:**

- [ ] Saved outputs for every live Droid step: a finished `prompts.jsonl`, `insights.json`, and a repaired adapter, plus their full log files, ready to replay if Wi-Fi or Droid is slow.
- [ ] A "replay" mode on `/jobs/{id}/logs` that streams a saved log at real speed, so the fallback looks the same as live.
- [ ] The demo export is pre-cached (F3), so ingest is instant. Keep the Mechanic live, since it's the Factory moment.
- [ ] You've timed the Mechanic repair at least 3 times. If it's over about 30 seconds, the 30-second demo slot needs the replay.
- [ ] Credits check: enough Factory credits left for rehearsals and the live demo.
- [ ] One sentence ready for judges: "Droid isn't a dev tool here, it's the runtime engine: it writes a parser for every new export format, writes each user's analysis, and repairs our extension when ChatGPT changes its page, and we independently verify everything it produces."

**Done when:** the README section matches the code, and every Factory demo step has a saved fallback you've tested.

**Commit:** `F7: README Where Droid works, demo fallbacks`

**Next:** the Daytona doc moves F1 to F6 into per-user sandboxes.
