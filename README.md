# Prompt Print

> Everyone here used AI today. Nobody knows what it cost. We built the app that tells you, and helps you cut it.

Prompt Print tracks your AI usage, shows the energy, water, and CO₂ behind it, and coaches you before you send a wasteful prompt. Factory's Droid does the heavy lifting inside the running app: it writes the code that reads each user's chat history, writes each user's analysis, and repairs the browser extension when ChatGPT changes its page. We independently verify everything it produces.

## Status

**All three Droid jobs run on a laptop, triggered through the backend; none run inside Daytona yet.** The FastAPI backend ([`backend/main.py`](backend/main.py)) starts the Ingestor and Analyst when a user uploads an export, and the Mechanic when the extension reports a capture failure. Each run is checked by our own code. Inside a Daytona sandbox Droid can't run: our tier blocks outbound traffic to Factory's domains (`app.factory.ai`, `api.factory.ai`, `downloads.factory.ai`) and refuses custom snapshots (403). So the sandbox flow runs **hand-written stand-in jobs** in place of Droid, letting everything around Droid (sandboxing, upload, validation, log streaming, cleanup) be built and tested. Below, anything not yet working is marked **planned**.

## Repo layout

| Path | What lives there |
| --- | --- |
| `backend/` | FastAPI API and job executors, placeholder footprint model, published adapters, saved demo runs, Daytona sandbox flow and cleanup; planned: real footprint model, xAI voice recap |
| `sandbox_jobs/` | Job code, uploaded fresh into each sandbox at the start of every run |
| `sandbox_jobs/lib/` | Our own schema, validator, and adapter checker. Never written by Droid |
| `sandbox_jobs/standin/` | Hand-written stand-ins for Jobs 1 and 2 while Droid can't run |
| `sandbox_jobs/samples/` | Fake exports (ChatGPT, Claude-style, CSV, planted), a cleaned real ChatGPT page, `break_adapter.py`, `clean_snapshot.py`. Never uploaded to a sandbox |
| `extension/` | Chrome Manifest V3 extension (TypeScript) and per-site adapters |
| `web/` | React + Vite dashboard |
| `evals/` | Chalk evals: coaching safety and parser accuracy |
| `space/` | Precomputed data center time-lapses and GRACE charts |

## Where Droid works

Each job is triggered by a user action or a failure, never by us: `POST /upload` starts the Ingestor then the Analyst, and `POST /adapter-failure` starts the Mechanic (see [Backend triggers](#backend-triggers)).

Every Droid SDK call goes through one function: `run_droid_job` in [`sandbox_jobs/droid_runner.py`](sandbox_jobs/droid_runner.py). It:
- opens a Python Droid SDK `Session` in the job's own `droid/` folder, with Droid's default tools and autonomy `OFF`, so every file write and command reaches our permission handler
- streams the turn, writing a short log (`<job>.jsonl`, which the UI streams) and a full transcript (`<job>.transcript.jsonl`, for the privacy test)
- sends up to 2 follow-up turns if a refused action ended Droid's turn
- returns success, Droid's text and structured output, duration, `factory_credits`, the log path and any rejected actions, and never raises on a Droid error or timeout

[`sandbox_jobs/try_runner.py`](sandbox_jobs/try_runner.py) tests it: Droid writes and runs a hello script, and an attempt to write into `lib/` is blocked.

Each job decides success with **our own checks on the files Droid wrote**, not by how Droid's turn ended. A turn can end in a connection error after the work already passes, and that has happened several times. A changed protected folder always fails the job.

Inside the Daytona sandbox, which Factory's domains can't reach yet, [`sandbox_jobs/run_jobs.py`](sandbox_jobs/run_jobs.py) runs hand-written stand-ins; `run_jobs.py --droid` runs the real jobs.

### Job 1: The Ingestor

- **Trigger:** the user uploads a chat export (`POST /upload`). Tested formats: ChatGPT `conversations.json`, a Claude-style export, and a generic CSV. Gemini Takeout is planned.
- **What Droid does (implemented, laptop):** [`sandbox_jobs/ingest.py`](sandbox_jobs/ingest.py) copies our schema and validator into `work/lib`, then calls `run_droid_job("ingest", PROMPT, output_model=IngestSummary)`. Droid inspects the export by writing small scripts that print its structure (never reading the whole file into the conversation), writes `work/droid/parser.py`, writes and runs `test_parser.py`, and fixes the parser until the tests and our validator pass. It replies with a structured summary: format, exchanges, models, regenerations, images, notes.
- **Output:** `work/output/prompts.jsonl`, one line per exchange, with regenerations as separate exchanges. In the sandbox flow it never leaves the sandbox.
- **Independent verification (implemented):** [`sandbox_jobs/lib/validate_prompts.py`](sandbox_jobs/lib/validate_prompts.py) checks every line against [`sandbox_jobs/lib/schema.json`](sandbox_jobs/lib/schema.json) and prints counts (exchanges, per model, regenerations, images). Its errors name the line and field, never the value. After Droid finishes, `ingest.py` runs the validator itself and reports success only if it passes, whatever Droid claimed. The sandbox's `run_jobs.py` does the same after the stand-in parser.
- **Tested on the fake ChatGPT sample:** our validator passed with 8 exchanges (gpt-4o 5, gpt-4o-mini 2, o3 1), 1 regeneration and 1 image, which matches the sample. Droid's output also matches the hand-written [`prompts_example.jsonl`](sandbox_jobs/samples/chatgpt_fake/prompts_example.jsonl) field for field, except that it spells `provider` as `ChatGPT`. The run took about 4.4 minutes and 10,355 factory_credits.
- **Other formats (implemented, laptop):** fresh Droid runs on the fake [Claude-style export](sandbox_jobs/samples/claude_fake/conversations.json) (5 exchanges) and the [generic CSV](sandbox_jobs/samples/csv_fake/chat_log.csv) (6 exchanges) also pass our validator. After the validator passes, `ingest.py` lowercases `provider`, since Droid's parsers spell it differently.
- **Parser cache (implemented, laptop):** [`sandbox_jobs/lib/fingerprint.py`](sandbox_jobs/lib/fingerprint.py) hashes the export's structure only (JSON key paths and value types with ID-like keys collapsed, or CSV headers), never its values. After a successful Droid run, `parser.py` is saved to `parser_cache/<fingerprint>/` (gitignored; the tests aren't saved, since they can hold sample text). The next export with the same structure runs the cached parser and our validator, and skips Droid if the validator passes. On the ChatGPT sample, a cache hit took 0.39 s and 0 credits, and the same cached parser handled a different ChatGPT-format file.
- **Eval 2 data (implemented):** `py sandbox_jobs/ingest.py --input FILE --no-cache --repeat N` runs the Ingestor N times from a clean `work/` and writes [`evals/eval2_runs.csv`](evals/eval2_runs.csv): success, attempts (rounds of Droid's tests or our validator), first_try, counts, duration and credits per run. With N=3 on the ChatGPT sample, all 3 runs passed with the right counts, 1 of 3 on the first try, in 100–124 s and 15,337–24,969 credits each.
- **Stand-in in the sandbox today:** [`sandbox_jobs/standin/parse_chatgpt.py`](sandbox_jobs/standin/parse_chatgpt.py), a hand-written parser for ChatGPT's tree format only.
- **Planned:** running the Droid Ingestor inside Daytona; a real ChatGPT export; Gemini Takeout.

### Job 2: The Analyst

- **Trigger:** a successful ingest, in the same `POST /upload` job (planned: also weekly).
- **Through the backend:** an upload of the fake ChatGPT sample succeeded end to end. Ingest hit the cache (0 credits), and the Analyst passed all four checks in about 220 s and 31,149 factory_credits; `/insights/latest` then served its tips. **Its cost varies a lot:** an earlier upload spent 157,839 credits, mostly in 8.5 minutes of Droid thinking, and then failed when Droid used its `Script` tool (see [Known issues](#known-issues)).
- **What Droid does (implemented, laptop):** [`sandbox_jobs/analyze.py`](sandbox_jobs/analyze.py) copies `footprint.py`, [`insights_schema.json`](sandbox_jobs/lib/insights_schema.json) and our [`validate_insights.py`](sandbox_jobs/lib/validate_insights.py) into `work/lib`, then calls `run_droid_job("analyze", PROMPT, output_model=AnalystSummary)`. Droid writes `work/droid/analyze.py`, a pandas analysis that checks for repeated questions, regenerate loops, long answers to short asks, image or video spikes and time-of-day patterns, and keeps the 3 with the biggest estimated savings. Every energy, water and CO2 number comes from calling [`backend/footprint.py`](backend/footprint.py).
- **Output:** `insights.json`: totals (energy, water, CO2 as low/high ranges) and exactly 3 tips, each with real counts, up to 3 example prompts truncated to 80 characters, estimated savings and a one-sentence fix. This, the job summary, and the logs are the only things that leave the sandbox.
- **Independent verification (implemented):** after Droid finishes, `analyze.py` runs four checks, and any failure fails the job: (1) `footprint.py`'s SHA-256 is unchanged; (2) `insights.json` passes our validator, which checks the schema, low ≤ high and unique ids; (3) re-running Droid's script from scratch gives identical output, ignoring `generated_at`; (4) Droid's script imports `footprint` and has no number literals on lines about energy, water or carbon (0–3, percentages, and values passed straight into a `footprint` call are allowed). [`sandbox_jobs/check_footprint_sensitivity.py`](sandbox_jobs/check_footprint_sensitivity.py) re-runs Droid's script with footprint ranges doubled, without calling Droid, to prove the numbers really come from `footprint.py`.
- **Tested on the fake ChatGPT sample with a planted pattern** ([`samples/chatgpt_planted`](sandbox_jobs/samples/chatgpt_planted/conversations.json): the same CSS question asked 4 times). All four checks passed, and the planted pattern was tip 2. Doubling the medium-model range doubled the savings of the two tips on those models and left the image tip unchanged; doubling every range doubled every savings number and the totals.
- **`footprint.py` is a placeholder:** [`backend/footprint.py`](backend/footprint.py) has the agreed signatures (`energy_wh`, `water_ml`, `co2_g`, `compare_models`) and **made-up placeholder ranges**, clearly marked, until Person D's real model replaces it. None of its numbers are real estimates.
- **Stand-in in the sandbox today:** [`sandbox_jobs/standin/analyze.py`](sandbox_jobs/standin/analyze.py) writes placeholder tips from counts only. It has no footprint numbers and never copies chat text. `py sandbox_jobs/run_jobs.py --droid` runs the real Ingestor then Analyst; without `--droid` it runs the stand-ins.
- **Planned:** the real footprint model; running the Analyst inside Daytona (the sandbox tarball will need `footprint.py`); weekly runs.

### Job 3: The Mechanic

- **Trigger:** the extension fails to capture a prompt because the site's page layout changed, and reports it with `POST /adapter-failure`.
- **What Droid does (implemented, laptop):** [`sandbox_jobs/repair_adapter.py`](sandbox_jobs/repair_adapter.py) copies the page snapshot, its `expected.json`, the broken adapter and our checker into `work/mechanic`, then calls `run_droid_job("repair", ...)` with Droid's default tools. Droid searches the snapshot with small scripts, picks selectors on stable attributes (`role`, `aria-label`, `contenteditable`, `type`, meaningful `data-*`) rather than class names or generated ids, writes a fixed adapter with the version bumped by 1, and runs our checker until it passes.
- **Output:** a new adapter JSON. `repair_adapter.py` publishes it only if our checker passes, the keys are unchanged, and the version is exactly one higher and above what's already published. It does a PUT to the backend's `/adapters/{site}` if the backend answers, and otherwise writes [`backend/adapters/<site>.json`](backend/adapters/chatgpt.json). `--no-publish` skips publishing. The extension hot-loading it is planned (extension milestone M4).
- **Independent verification (implemented):** [`sandbox_jobs/lib/check_adapter.py`](sandbox_jobs/lib/check_adapter.py) checks an adapter against a snapshot with BeautifulSoup. The prompt box must match exactly one element containing the expected prompt text, the send button and responses must match, and the model name must have non-empty text (equal to the expected model if one is given). [`sandbox_jobs/samples/break_adapter.py`](sandbox_jobs/samples/break_adapter.py) breaks selectors on purpose for testing and the demo.
- **Tested on a real ChatGPT page** ([`samples/chatgpt_page/`](sandbox_jobs/samples/chatgpt_page/)), saved from a Temporary Chat and cleaned with [`samples/clean_snapshot.py`](sandbox_jobs/samples/clean_snapshot.py). The cleaning removes scripts, styles, images, metadata, the sidebar, conversation links, id attributes and email addresses; it took the page from 799,847 to 41,486 characters, and the visible text left is only interface labels and the test chat. The raw capture stays gitignored. The working adapter passed; `break_adapter.py` broke `prompt_box` and `send_button`, and the checker failed on exactly those two. Droid repaired both on the first try, leaving the other two unchanged, in 71 s and 4,881 factory_credits. Our checker passed and the adapter was published as v2.
- **The model name isn't on the page:** in this capture the model picker reads "Thinking effort Medium", and the model's name (ChatGPT 6) doesn't appear anywhere in the page's HTML. So `expected.json` sets `model` to `null`, and the model check only requires non-empty text. Capturing the model name will need another source, such as the picker's open menu.
- **Timed 3 times** (CLI, `--no-publish`, same broken adapter and page): 86.0 s, 60.3 s and 76.0 s wall clock; 4,868, 4,987 and 4,961 factory_credits. Droid fixed both selectors and our checker passed each time. Through the backend, two more repairs took 34 s and 47 s (12,738 and 10,880 credits). **That's over the demo's 30-second slot**, so the demo should either give the live repair about 90 seconds or use the replay (see [Demo fallbacks](#demo-fallbacks)).
- **Planned:** running the repair inside a short-lived Daytona sandbox (D6), and agreeing the selector key names with the extension owner (the extension's `chatgpt.json` is still a placeholder).

### Backend triggers

[`backend/main.py`](backend/main.py) (FastAPI). Run it with `py -m uvicorn backend.main:app`.

| Route | What it does |
| --- | --- |
| `POST /upload` | Multipart chat export. Creates a job and returns `{job_id}` at once (0.09 s in testing); ingest then analyze run in the background |
| `GET /jobs/{job_id}` | Status (`queued`, `running`, `succeeded`, `failed`), summary (counts, check results, credits) and error |
| `GET /jobs/{job_id}/logs` | Server-Sent Events: each new line of the job's Droid log as it's written, then an `end` event with the final status. Lines arrived live, spread over the run, not in one burst |
| `GET /insights/latest` | The latest successful analysis's `insights.json` |
| `POST /adapter-failure` | `{site, failed_keys, adapter_version, snapshot_html}`, plus optional `adapter`, `expected_prompt` and `has_responses`. Starts a repair. A report for an adapter older than the published one is ignored, and a report while a repair for that site is queued or running returns that job's id instead of starting another (tested with two simultaneous reports) |

- **Jobs sit behind an executor interface** ([`backend/executor.py`](backend/executor.py)): `JobExecutor` with `run_ingest_and_analyze` and `run_repair`. `LocalExecutor` runs the `sandbox_jobs` scripts in a fresh `work/jobs/<job_id>/` per job. `EXECUTOR` picks one (default `local`); a `DaytonaExecutor` is planned.
- **Job records** are kept in SQLite ([`backend/jobs.py`](backend/jobs.py), `backend/jobs.sqlite`, gitignored).
- **One Droid job at a time,** using an asyncio lock; others wait as `queued`. Jobs run in a worker thread, so requests are still answered while Droid works (`GET /jobs` took 0.01 s during a run).
- **Privacy in local mode:** when an upload job finishes, its export and its extracted `prompts.jsonl` are deleted. A repair's raw page snapshot goes through `clean_snapshot.py` before Droid sees it, and is then deleted. The job scripts' console output isn't kept, since it can include insight titles about the user's data.

### Demo fallbacks

Droid jobs take minutes and, as above, sometimes end on a connection error. So every live Droid step has a saved, replayable fallback:

- **Saved runs:** [`backend/demo_runs/upload/`](backend/demo_runs/upload/) holds a successful upload: the Analyst's log, `insights.json`, and the `prompts.jsonl` rebuilt from the fake sample. [`backend/demo_runs/repair/`](backend/demo_runs/repair/) holds a successful repair: its log, the broken and fixed adapters, and the job summary. Both came from fake data. [`backend/save_demo_run.py`](backend/save_demo_run.py) saves any succeeded job.
- **Replay mode:** start the backend with `DEMO_REPLAY=1`. `/upload` and `/adapter-failure` then replay a saved run instead of calling Droid: the saved log lines are written into the new job's log at their original pace, so `/jobs/{id}/logs` streams exactly as it would live. The saved insights or adapter are then put in place, and the repaired adapter is published one version above the current one, so the extension picks it up. The job summary says `"replayed": true`. `REPLAY_SPEED=10` speeds it up.
- **Tested:** the repair replay streamed in 34.2 s, against 33.8 s for the original run. The upload replay at 10× streamed 155 lines in 22.1 s (about 221 s at real speed, against 219.5 s originally), and `/insights/latest` served the saved tips.
- **Pre-cached ingest:** the demo's ChatGPT export format is in `parser_cache/`, so ingest takes under a second and costs no credits.
- **For judges:** "Droid isn't a dev tool here, it's the runtime engine: it writes a parser for every new export format, writes each user's analysis, and repairs our extension when ChatGPT changes its page, and we independently verify everything it produces."

### Known issues

- **The `Script` tool:** droid-sdk 0.5.0 can't turn a permission request from Droid's newer `Script` tool into an action ("unsupported permission action"), which ends the turn. The tool can't be switched off without losing Droid's file tools, so `run_droid_job` tells Droid in every prompt not to use it. That reduces the problem but doesn't guarantee it won't happen.
- **Connection errors** between the SDK and Factory have ended several turns. Our checks still accept work that was finished before the error, and the demo has replay.
- **Cost:** a fresh Droid run costs about 5,000 credits for a repair, about 9,000–40,000 for an ingest, and about 11,000–158,000 for an analysis. Check the remaining Factory credits before rehearsals.

### Guardrails

| Guardrail | Status |
| --- | --- |
| Independent validation before anything is used or published | Implemented for all three jobs: our validator for the Ingestor, the four checks for the Analyst, and our adapter checker plus key and version checks before the Mechanic publishes |
| Path-restricted permissions | Implemented in `droid_runner.py`. Our permission handler approves file writes only inside `work/droid` and `work/output`. It approves commands only if every part (split on `&&` or `;`) is `python`/`py`/`pytest` on files inside `work/`, or a `cd` into `work/`. `python -c`, pipes, redirects and other programs are refused, and the reason is logged. The session runs at autonomy `OFF` so every edit and command reaches the handler; higher levels let Droid run them without asking. Inside Daytona, the sandbox is the outer boundary |
| Read-only `lib/` and `input/` folders | Implemented: Droid can't write there, the Ingestor prompt says never to modify them, and `droid_runner.py` fingerprints both folders before and after each job and fails the job if either changed. That catches a script Droid wrote and ran that writes there, which the per-action check can't see |
| `footprint.py` never edited, and the only source of numbers | Implemented: SHA-256 checked after each Analyst run, a scan for hard-coded energy, water and carbon constants in Droid's script, and a doubling test showing the savings follow `footprint.py` |
| Droid never sees real chat text | Implemented. The Ingestor passed end to end on redacted data, the full run with the Analyst hasn't passed yet, and the privacy test passes on the latest run: see [Privacy](#privacy) |
| No chat text in logs | Implemented: `droid_runner.py` logs message types, tool names, file paths, commands and assistant text capped at 200 characters. Tool results are logged by name and error flag only, never their content. The stand-ins log only events and counts |
| Unattended runs | Implemented: if Droid asks a question, `droid_runner.py` declines it and logs it, and Droid proceeds from the prompt. A refused action ends Droid's turn, so the runner sends up to 2 follow-up turns in the same session saying what was refused, and Droid carries on |
| Scripts Droid runs | Known gap: a Python script Droid wrote can do anything the user running it can. The `lib/` and `input/` fingerprint check catches writes there after the fact; the sandbox is the real boundary |

### Privacy

**Goal:** Droid never sees a user's real chat text. Droid sends what it reads to a model provider, so anything it sees leaves the machine.

**Status: the Ingestor half passes; the full end-to-end run has not passed yet.** In the latest run on the planted sample, the Ingestor passed: Droid saw only the redacted copy, and its parser then passed our validator on the real export with matching counts (158 s, 40,243 factory_credits). The Analyst failed: Droid's turn ended on a connection error between the SDK and Factory after 463 s, before it wrote `analyze.py` (11,079 credits). Per our rule of one attempt, it wasn't retried. On that run's files, all 7 checks in `test_privacy.py` pass: no marker word reached Droid in either job, and its file tools stayed inside `droid_view`. The other results quoted for Jobs 1 and 2 above came from earlier runs, before this change, where Droid worked directly on the fake samples.

How it works (all in `sandbox_jobs/`):

- **Droid works only in its own folder,** `droid_view/ingest` or `droid_view/analyze`, outside `work/`. Its permission rules only allow writes and Python commands inside that folder. Our code then copies the script Droid wrote into `work/` and runs it on the real data itself, without Droid.
- **Ingestor:** Droid gets a redacted copy of the export ([`lib/redact.py`](sandbox_jobs/lib/redact.py)). The copy has the same structure, and therefore the same fingerprint, but every text value is replaced by `"<text N chars>"`. Kept: numbers, booleans, keys, timestamps, empty strings, and fields whose every value is a short single token (roles, content types, model names, IDs that link messages). Anything with a space, `@` or `://` is replaced. Tested on all four samples: the fingerprint was unchanged, no marker word survived, and the existing parsers produced identical counts, kinds, models and timestamps on the redacted copy and the real file. `ingest.py` then runs Droid's `parser.py` on the real export, runs our validator, and requires the counts to match the redacted run.
- **Analyst:** Droid gets our schemas, `footprint.py`, the fake sample's `prompts.jsonl` and an `aggregates.json` of the real data (counts per model, day and kind, regenerations, prompt and response lengths). It never gets the real prompts. `analyze.py` runs Droid's script on the real `prompts.jsonl` and applies its four checks there.
- **Droid's default tools:** these jobs use the same tool settings as F2 and F3, with no tool lists. Droid may use Read and Grep, but the folder it works in holds only redacted or fake data. File reads never reach the permission handler, so a Read given an absolute path could still open another file on the machine; the privacy test is what checks that nothing real reached Droid. The permission handler refuses anything it can't check, such as a subagent's request, instead of crashing.
- **Our checks decide success:** each job judges the files Droid wrote with our own checks, not by how Droid's turn ended, because a turn can end in a connection error after the work already passes. A changed protected folder still always fails.
- **Full transcripts:** `work/logs/<job>.transcript.jsonl` records everything Droid sent and received: prompts, messages, tool inputs, tool results and its final output.
- **Privacy test:** [`test_privacy.py`](sandbox_jobs/test_privacy.py). The planted sample contains marker words ([`markers.txt`](sandbox_jobs/samples/chatgpt_planted/markers.txt)) that appear nowhere in the data Droid may see. After an end-to-end run, the test first checks that the markers are in the real data (a control). It then fails if any marker appears in Droid's logs, transcripts or folders, or if Droid's file tools (Read, Grep, LS, Glob) were pointed outside its folder. Run it with `py -m pytest sandbox_jobs/test_privacy.py`.

**How we got here:** we first tried turning Read and Grep off. In the SDK, turning off *any* tool also removed Droid's file-writing tools. With the needed tools listed explicitly, Droid worked blind, fell back on shell writes and subagents, and once ended its turn without doing anything. Those attempts cost over 68,000 factory_credits, plus one timed-out run that reported no cost. With the default tools, Droid did the work. The two runs since then each ended on a connection error: the first after the Ingestor's parser had passed (before our checks were the deciding factor), and the second in the Analyst.

**Limits, stated plainly:**
- Nothing stops a Python script Droid writes, or a file tool given an absolute path, from opening other files on this laptop. The separate folder, the prompt and the privacy test reduce and detect that; they don't prevent it. Inside a Daytona sandbox that only holds the redacted data, the sandbox would prevent it.
- Redaction keeps fields whose every value is one short word, so a one-word title in every conversation would get through. Lengths of replaced text are visible.
- `aggregates.json` and the kept token fields reveal model names, dates and volumes. They reveal no text.

## Where Daytona works

All in [`backend/sandbox.py`](backend/sandbox.py) (`run_user_jobs`), tested with [`backend/try_sandbox_flow.py`](backend/try_sandbox_flow.py).

- **One fresh sandbox per job.** Today: a default Daytona sandbox, with dependencies pip-installed at the start of each run. Planned: a prebuilt dependency snapshot. [`sandbox_jobs/build_snapshot.py`](sandbox_jobs/build_snapshot.py) is ready, but our tier refuses snapshot creation (403).
- **Keys only via `env_vars`** at sandbox creation: never baked into an image, written to a file, or put in a command string.
- **The raw export is uploaded from memory** and never written to the backend's disk. Planned for Daytona mode: `/upload` reads the request body into memory itself, because FastAPI's `UploadFile`, which local mode uses, can spill large files to a temp file.
- **Only results come back.** A fixed list in `sandbox.py` allows downloading only `insights.json`, `summary.json`, and `logs/*.jsonl`. `prompts.jsonl` and the uploaded export can't be downloaded. Each run returns an audit of every file uploaded and downloaded, by name and size.
- **Sandboxes are deleted after each job,** in a `finally` block, including after errors and timeouts (10-minute job limit). As a backstop, each sandbox is ephemeral, auto-stops after 15 idle minutes, and has a 20-minute time limit. Each is labeled `app=promptprint` plus its `job_id`, and [`backend/cleanup_sandboxes.py`](backend/cleanup_sandboxes.py) deletes any labeled sandbox older than 15 minutes, never touching anything else.
- **Live logs:** the jobs run as a Daytona session command, and each log line streams to the backend as it's printed. The backend's `/jobs/{id}/logs` stream exists for local jobs; connecting it to sandbox jobs comes with the planned `DaytonaExecutor`.
- **Repairs in short-lived sandboxes, verified by the backend:** planned (Daytona milestone D6).

Measured on the fake sample with the stand-ins: sandbox creation about 0.8–0.9 s, and the whole run, from create to delete, 2.6–4.1 s across runs. Real Droid jobs will take minutes.

## Setup

Requires Python 3.12+. On Windows, use `py` if `python` opens the Microsoft Store.

```
py -m pip install daytona droid-sdk python-dotenv jsonschema beautifulsoup4 pytest pandas fastapi uvicorn python-multipart
```

Install the droid CLI (`irm https://app.factory.ai/cli/windows | iex` on Windows) and open a new terminal so `droid` is on PATH. Copy `.env.example` to `.env` and fill in the keys: `FACTORY_API_KEY` for Droid, `DAYTONA_API_KEY` for the sandbox flow.

```
py sandbox_jobs/smoke_droid.py                # Droid answers "OK"
py sandbox_jobs/try_runner.py                 # job runner: hello job works, write into lib/ is blocked
py sandbox_jobs/ingest.py                     # Droid Ingestor on the one export in work/input/
py -m uvicorn backend.main:app                # the backend; API docs at http://localhost:8000/docs
```

Demo fallback (PowerShell): `$env:DEMO_REPLAY = "1"; py -m uvicorn backend.main:app` replays the saved runs instead of calling Droid.

```
py backend/try_sandbox_flow.py                # full sandbox run on the fake ChatGPT sample
py backend/try_sandbox_flow.py --delay 2      # slower stand-ins, to watch logs stream live
py backend/try_sandbox_flow.py --marker       # privacy check: a marker word in the export must not come back
py backend/cleanup_sandboxes.py --dry-run     # list leftover sandboxes (drop --dry-run to delete them)
py sandbox_jobs/lib/validate_prompts.py sandbox_jobs/samples/chatgpt_fake/prompts_example.jsonl
py sandbox_jobs/lib/check_adapter.py --adapter sandbox_jobs/samples/tiny_chatgpt/adapter.json --snapshot sandbox_jobs/samples/tiny_chatgpt/snapshot.html
```
