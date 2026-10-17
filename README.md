# Prompt Print

> Everyone here used AI today. Nobody knows what it cost. We built the app that tells you, and helps you cut it.

Prompt Print tracks your AI usage, shows the energy, water, and CO₂ behind it, and coaches you before you send a wasteful prompt. Factory's Droid is designed to do the heavy lifting inside the running app: write the code that reads each user's chat history, analyze their habits, and repair the browser extension when ChatGPT changes its page.

## Status

**Droid works locally, but not yet inside Daytona.** On a laptop, the droid CLI and the Python Droid SDK both run and answer ([`sandbox_jobs/smoke_droid.py`](sandbox_jobs/smoke_droid.py)). Inside a Daytona sandbox they can't: our tier blocks outbound traffic to Factory's domains (`app.factory.ai`, `api.factory.ai`, `downloads.factory.ai`), so droid can't install or authenticate there, and the tier also refuses custom snapshots (403). Until that's lifted, the sandbox flow runs **hand-written stand-in jobs** in place of Droid, so everything around Droid (sandboxing, upload, validation, log streaming, cleanup) can be built and tested for real. Below, anything Droid does is marked **planned** until it runs; everything else is implemented and tested.

## Repo layout

| Path | What lives there |
| --- | --- |
| `backend/` | Daytona sandbox flow and cleanup; planned: FastAPI API, footprint model, xAI voice recap |
| `sandbox_jobs/` | Job code, uploaded fresh into each sandbox at the start of every run |
| `sandbox_jobs/lib/` | Our own schema, validator, and adapter checker. Never written by Droid |
| `sandbox_jobs/standin/` | Hand-written stand-ins for Jobs 1 and 2 while Droid can't run |
| `sandbox_jobs/samples/` | Fake ChatGPT export, tiny test page, `break_adapter.py`. Never uploaded |
| `extension/` | Chrome Manifest V3 extension (TypeScript) and per-site adapters |
| `web/` | React + Vite dashboard |
| `evals/` | Chalk evals: coaching safety and parser accuracy |
| `space/` | Precomputed data center time-lapses and GRACE charts |

## Where Droid works

Each job is triggered by a user action or a failure, never by us. Every Droid call goes through one function: `run_droid_job` in [`sandbox_jobs/droid_runner.py`](sandbox_jobs/droid_runner.py). It opens a Python Droid SDK `Session` in `work/droid`, streams the turn, writes each message to `work/logs/<job>.jsonl`, and returns success, Droid's text and structured output, duration, `factory_credits`, the log path, and any rejected actions. It never raises on a Droid error or timeout. [`sandbox_jobs/try_runner.py`](sandbox_jobs/try_runner.py) tests it: Droid writes and runs a hello script, and an attempt to write into `lib/` is blocked.

Today the Droid jobs run on a laptop with `work/` as the work folder. Inside the Daytona sandbox, which Factory's domains can't reach yet, [`sandbox_jobs/run_jobs.py`](sandbox_jobs/run_jobs.py) runs hand-written stand-ins instead (planned: the same Droid jobs, unchanged).

### Job 1: The Ingestor

- **Trigger:** the user uploads a chat export. Planned formats: ChatGPT `conversations.json`, Claude export, Gemini Takeout, CSV.
- **What Droid does (implemented, laptop):** [`sandbox_jobs/ingest.py`](sandbox_jobs/ingest.py) copies our schema and validator into `work/lib`, then calls `run_droid_job("ingest", PROMPT, output_model=IngestSummary)`. Droid inspects the export by writing small scripts that print its structure (never reading the whole file into the conversation), writes `work/droid/parser.py`, writes and runs `test_parser.py`, and fixes the parser until the tests and our validator pass. It replies with a structured summary: format, exchanges, models, regenerations, images, notes.
- **Output:** `work/output/prompts.jsonl`, one line per exchange, with regenerations as separate exchanges. In the sandbox flow it never leaves the sandbox.
- **Independent verification (implemented):** [`sandbox_jobs/lib/validate_prompts.py`](sandbox_jobs/lib/validate_prompts.py) checks every line against [`sandbox_jobs/lib/schema.json`](sandbox_jobs/lib/schema.json) and prints counts (exchanges, per model, regenerations, images). Its errors name the line and field, never the value. After Droid finishes, `ingest.py` runs the validator itself and reports success only if it passes, whatever Droid claimed. The sandbox's `run_jobs.py` does the same after the stand-in parser.
- **Tested on the fake ChatGPT sample:** our validator passed with 8 exchanges (gpt-4o 5, gpt-4o-mini 2, o3 1), 1 regeneration and 1 image, which matches the sample. Droid's output also matches the hand-written [`prompts_example.jsonl`](sandbox_jobs/samples/chatgpt_fake/prompts_example.jsonl) field for field, except that it spells `provider` as `ChatGPT`. The run took about 4.4 minutes and 10,355 factory_credits.
- **Stand-in in the sandbox today:** [`sandbox_jobs/standin/parse_chatgpt.py`](sandbox_jobs/standin/parse_chatgpt.py), a hand-written parser for ChatGPT's tree format only.
- **Planned:** running the Droid Ingestor inside Daytona; a real ChatGPT export and other formats (Claude, Gemini, CSV); a parser cache keyed by export fingerprint (F3).

### Job 2: The Analyst

- **Trigger:** after a successful ingest (planned: also weekly).
- **What Droid does (planned):** writes and runs pandas analysis over `prompts.jsonl` to find this user's waste patterns, taking every number from `footprint.py`.
- **Output:** `insights.json` with the top 3 coaching tips. This, the job summary, and the logs are the only things that leave the sandbox.
- **Independent verification (planned):** a hash check that `footprint.py` was not edited. `backend/footprint.py` is still a stub.
- **Stand-in today:** [`sandbox_jobs/standin/analyze.py`](sandbox_jobs/standin/analyze.py) writes placeholder tips from counts only (regenerations, images, most-used model). It has no footprint numbers and never copies chat text.
- **Planned:** the Droid version in [`sandbox_jobs/analyze.py`](sandbox_jobs/analyze.py) (currently a stub).

### Job 3: The Mechanic

- **Trigger:** the extension fails to capture a prompt because the site's page layout changed.
- **What Droid does (planned):** searches the saved page snapshot for the prompt box, send button, model name, and responses, preferring stable attributes (`id`, `data-testid`, `aria-label`, `role`) over class names, and writes a fixed adapter with the version bumped by 1.
- **Output:** a new adapter JSON. The extension hot-loads it (planned, extension milestone M4).
- **Independent verification (implemented):** [`sandbox_jobs/lib/check_adapter.py`](sandbox_jobs/lib/check_adapter.py) checks an adapter against a snapshot with BeautifulSoup. The prompt box must match exactly one element and contain the expected prompt text. The send button and responses must match. The model name must match the expected model. Any failure exits 1. [`sandbox_jobs/samples/break_adapter.py`](sandbox_jobs/samples/break_adapter.py) breaks selectors on purpose for testing and the demo. Both are tested against a tiny hand-written page in [`sandbox_jobs/samples/tiny_chatgpt/`](sandbox_jobs/samples/tiny_chatgpt/), not a real ChatGPT capture yet.
- **Planned:** the Droid repair in [`sandbox_jobs/repair_adapter.py`](sandbox_jobs/repair_adapter.py) (currently a stub), and publishing only after the checker passes on the backend. The adapter's selector key names are provisional until the extension's `chatgpt.json` is final.

### Guardrails

| Guardrail | Status |
| --- | --- |
| Independent validation before anything is used or published | Implemented for Job 1: `ingest.py` and the sandbox's `run_jobs.py` both run our validator and fail unless it passes. The Job 3 checker is implemented; gating publication on it is planned |
| Path-restricted permissions | Implemented in `droid_runner.py`. Our permission handler approves file writes only inside `work/droid` and `work/output`. It approves commands only if every part (split on `&&` or `;`) is `python`/`py`/`pytest` on files inside `work/`, or a `cd` into `work/`. `python -c`, pipes, redirects and other programs are refused, and the reason is logged. The session runs at autonomy `OFF` so every edit and command reaches the handler; higher levels let Droid run them without asking. Inside Daytona, the sandbox is the outer boundary |
| Read-only `lib/` and `input/` folders | Implemented: Droid can't write there, the Ingestor prompt says never to modify them, and `droid_runner.py` fingerprints both folders before and after each job and fails the job if either changed. That catches a script Droid wrote and ran that writes there, which the per-action check can't see |
| `footprint.py` never edited | Planned: hash check after each Analyst run |
| No chat text in logs | Implemented: `droid_runner.py` logs message types, tool names, file paths, commands and assistant text capped at 200 characters. Tool results are logged by name and error flag only, never their content. The stand-ins log only events and counts |
| Unattended runs | Implemented: if Droid asks a question, `droid_runner.py` declines it and logs it, and Droid proceeds from the prompt |

## Where Daytona works

All in [`backend/sandbox.py`](backend/sandbox.py) (`run_user_jobs`), tested with [`backend/try_sandbox_flow.py`](backend/try_sandbox_flow.py).

- **One fresh sandbox per job.** Today: a default Daytona sandbox, with dependencies pip-installed at the start of each run. Planned: a prebuilt dependency snapshot. [`sandbox_jobs/build_snapshot.py`](sandbox_jobs/build_snapshot.py) is ready, but our tier refuses snapshot creation (403).
- **Keys only via `env_vars`** at sandbox creation: never baked into an image, written to a file, or put in a command string.
- **The raw export is uploaded from memory** and never written to the backend's disk. Planned: the `/upload` route reads the request body into memory, because FastAPI's `UploadFile` can spill large files to a temp file.
- **Only results come back.** A fixed list in `sandbox.py` allows downloading only `insights.json`, `summary.json`, and `logs/*.jsonl`. `prompts.jsonl` and the uploaded export can't be downloaded. Each run returns an audit of every file uploaded and downloaded, by name and size.
- **Sandboxes are deleted after each job,** in a `finally` block, including after errors and timeouts (10-minute job limit). As a backstop, each sandbox is ephemeral, auto-stops after 15 idle minutes, and has a 20-minute time limit. Each is labeled `app=promptprint` plus its `job_id`, and [`backend/cleanup_sandboxes.py`](backend/cleanup_sandboxes.py) deletes any labeled sandbox older than 15 minutes, never touching anything else.
- **Live logs:** the jobs run as a Daytona session command, and each log line streams to the backend as it's printed. Wiring it to the dashboard's `/jobs/{id}/logs` stream is planned (the API doesn't exist yet).
- **Repairs in short-lived sandboxes, verified by the backend:** planned (Daytona milestone D6).

Measured on the fake sample with the stand-ins: sandbox creation about 0.8–0.9 s, and the whole run, from create to delete, 2.6–4.1 s across runs. Real Droid jobs will take minutes.

## Setup

Requires Python 3.12+. On Windows, use `py` if `python` opens the Microsoft Store.

```
py -m pip install daytona droid-sdk python-dotenv jsonschema beautifulsoup4 pytest
```

Install the droid CLI (`irm https://app.factory.ai/cli/windows | iex` on Windows) and open a new terminal so `droid` is on PATH. Copy `.env.example` to `.env` and fill in the keys: `FACTORY_API_KEY` for Droid, `DAYTONA_API_KEY` for the sandbox flow.

```
py sandbox_jobs/smoke_droid.py                # Droid answers "OK"
py sandbox_jobs/try_runner.py                 # job runner: hello job works, write into lib/ is blocked
py sandbox_jobs/ingest.py                     # Droid Ingestor on the one export in work/input/
```

```
py backend/try_sandbox_flow.py                # full sandbox run on the fake ChatGPT sample
py backend/try_sandbox_flow.py --delay 2      # slower stand-ins, to watch logs stream live
py backend/try_sandbox_flow.py --marker       # privacy check: a marker word in the export must not come back
py backend/cleanup_sandboxes.py --dry-run     # list leftover sandboxes (drop --dry-run to delete them)
py sandbox_jobs/lib/validate_prompts.py sandbox_jobs/samples/chatgpt_fake/prompts_example.jsonl
py sandbox_jobs/lib/check_adapter.py --adapter sandbox_jobs/samples/tiny_chatgpt/adapter.json --snapshot sandbox_jobs/samples/tiny_chatgpt/snapshot.html
```
