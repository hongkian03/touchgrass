# touchgrass

> Everyone here used AI today. Nobody knows what it cost. We built the app that tells you, and helps you cut it.

touchgrass tracks your AI usage, shows the energy, water, and CO₂ behind it, and coaches you before you send a wasteful prompt. Factory's Droid does the heavy lifting inside the running app: it writes the code that reads each user's chat history, writes each user's analysis, and repairs the browser extension when ChatGPT changes its page. We independently verify everything it produces.

## How it all fits together

One backend ([`backend/main.py`](backend/main.py)) turns two kinds of product events into Droid jobs. Start it with `py start.py`. It runs in **Daytona mode** when `DAYTONA_API_KEY` is set, **local mode** when it isn't, and **replay mode** (saved runs, for bad Wi-Fi) with `--replay`; it logs which one at startup. The flows below are Daytona mode, the default for the demo.

**A user uploads their ChatGPT export** (`POST /upload`):

1. **Backend:** reads the upload into memory, never to disk.
2. **Daytona sandbox (one per upload):** the export goes in from memory. [`redact.py`](sandbox_jobs/lib/redact.py) replaces every piece of text with a placeholder like `<text 42 chars>` and keeps the structure. Only this redacted copy comes back out.
3. **Backend, Droid Ingestor:** from the redacted copy, Droid writes `parser.py`, a parser for this export format. A format we've seen before reuses the cached parser instead.
4. **Backend, Droid Analyst:** from fake prompts and counts of the real data, Droid writes `analyze.py`, the user's waste analysis.
5. **Same sandbox:** both scripts run on the real export, next to our validator and checks. Only `insights.json` and a counts-only `summary.json` come out.
6. **Sandbox deleted.** The dashboard reads `GET /insights/latest`, watches `GET /jobs/{id}/logs` live, and can show `GET /jobs/{id}/audit`: every file that went into or out of the sandbox.

**ChatGPT changes its page and the extension's capture breaks** (`POST /adapter-failure`, with a snapshot of the page):

1. **Daytona sandbox (short-lived):** the raw page goes in from memory. [`clean_snapshot.py`](sandbox_jobs/samples/clean_snapshot.py) removes scripts, the sidebar, conversation links and email addresses, and refuses the page if anything private is left. Only the cleaned page comes out, and the sandbox is deleted.
2. **Backend, Droid Mechanic:** from the cleaned page, Droid finds new selectors and writes the next adapter version.
3. **Backend, our checker:** [`check_adapter.py`](sandbox_jobs/lib/check_adapter.py) tests the adapter against the page. It's published to [`backend/adapters/`](backend/adapters/) only if it passes. The extension is meant to load the new version from there; that part isn't built yet (see [Honest limits](#honest-limits)).

## Where and how Droid is used

**Droid runs at runtime, inside the product, not as a developer tool.** Every job is triggered by a user's upload or a live failure. It runs unattended through the Python Droid SDK, and its output reaches users only after our own code has checked it. All three jobs go through one function, [`run_droid_job`](sandbox_jobs/droid_runner.py#L229) in `sandbox_jobs/droid_runner.py`. It opens a Droid SDK `Session` in the job's own folder with a permission handler that allows file writes and Python commands only inside that folder. It also logs every message and tool call, adds the same tool and folder rules to every prompt, and never raises on a Droid error.

| Job | Trigger in the product | What Droid does | Output | How we verify it | Code that calls Droid |
| --- | --- | --- | --- | --- | --- |
| **Ingestor** | `POST /upload` with an export format we haven't seen (a known format uses the cached parser, 0 credits) | Inspects the **redacted** export with small scripts, writes `parser.py` and its own tests, and runs our validator until it passes | `parser.py`, which turns the export into `prompts.jsonl` (our fixed schema) | Our [validator](sandbox_jobs/lib/validate_prompts.py) on the redacted output, then in the sandbox on the real export, where the counts must match. The parser is cached only after both pass | [`ingest_once`](sandbox_jobs/ingest.py#L227), Droid call at [`ingest.py#L257`](sandbox_jobs/ingest.py#L257) |
| **Analyst** | Every upload, right after the Ingestor | Writes `analyze.py`, a pandas analysis that finds the user's 3 biggest sources of wasted energy, from **fake** prompts plus counts of the real data. Every energy, water and CO₂ number must come from [`footprint.py`](backend/footprint.py) | `insights.json`: totals and 3 tips with real counts, examples and a fix | [Four checks](sandbox_jobs/analyze.py#L265): `footprint.py` unchanged, schema valid, re-run identical, no hard-coded footprint numbers. Run on the redacted data, then again on the real data in the sandbox ([`run_real.py`](sandbox_jobs/run_real.py)) | [`analyze.py` `main`](sandbox_jobs/analyze.py#L315), Droid call at [`analyze.py#L334`](sandbox_jobs/analyze.py#L334) |
| **Mechanic** | `POST /adapter-failure`: the extension's selectors stopped matching ChatGPT's page | Searches the **cleaned** page for stable attributes, writes the fixed adapter with the version bumped, and runs our checker until it passes | A new adapter JSON for the extension | [`check_adapter.py`](sandbox_jobs/lib/check_adapter.py) runs on the backend, the keys must be unchanged, and the version must be exactly one up. [`publish`](sandbox_jobs/repair_adapter.py#L97) runs only if all of that passes | [`repair_adapter.py` `main`](sandbox_jobs/repair_adapter.py#L121), Droid call at [`repair_adapter.py#L151`](sandbox_jobs/repair_adapter.py#L151) |

**Measured in Daytona mode:** the Ingestor took 131–169 s and 31,832–39,403 factory_credits per new format (0 on a cache hit), and the Analyst took 176–270 s and 28,237–60,434 credits. A full upload cost 60,069–99,837 credits, and a repair took 62–65 s and 5,233–5,610 credits. The latest live run of both flows (`py smoke_test.py --live`) cost 65,302 credits in total. Droid's success never decides anything on its own: a turn that ends in an error still passes if our checks pass on what it wrote, and a turn that "succeeds" still fails if they don't.

## Where and how Daytona is used

**Why:** two things should never live on our server: users' private chat history, and code an AI agent just wrote. The sandbox holds both, and only checked results come out. *"Untrusted, agent-written code running on private data is exactly the problem sandboxes solve."*

| Sandbox | What goes in | What comes out | What never comes out | Measured |
| --- | --- | --- | --- | --- |
| **Upload** (one per user upload) | Our job code (41 KB), the user's export (from memory), and later the `parser.py` and `analyze.py` Droid wrote | The redacted copy, `insights.json`, and `summary.json` (counts, check results, timings) | The export and the parsed `prompts.jsonl` | create 0.7–0.9 s, redact 0.2–0.3 s, real-data run 3.5–3.7 s, delete 0.1 s. About 8 s of work in total; it lives about 7 minutes while Droid works on the backend |
| **Repair** (one per capture failure) | `clean_snapshot.py` and the raw page snapshot (800 KB in our test, from memory) | The cleaned page (41 KB) | The raw snapshot | 2–9 s from create to delete across runs, mostly sandbox creation (0.9–6.1 s); cleaning 0.2–0.4 s |

- **Code:** [`run_hybrid_jobs`](backend/sandbox.py#L276) and [`clean_snapshot_in_sandbox`](backend/sandbox.py#L402) in `backend/sandbox.py`, called by [`DaytonaExecutor`](backend/executor.py#L141). [`run_real.py`](sandbox_jobs/run_real.py) is what runs inside the upload sandbox.
- **Proof, not promises:** [`GET /jobs/{id}/audit`](backend/main.py#L134) lists every file that went into or out of a job's sandbox, by name and size. With `PRIVACY_MODE=daytona`, [`test_privacy.py`](sandbox_jobs/test_privacy.py) fails if any planted marker word from the sample is anywhere on the backend outside the returned insights.
- **No leftovers:** each sandbox is deleted in a `finally`. As a backstop it's ephemeral, auto-stops and has a time limit, and it's labeled so [`cleanup_sandboxes.py`](backend/cleanup_sandboxes.py) (run by `start.py`) can delete leftovers. Tested by killing the backend mid-job: the cleanup found and deleted the sandbox.
- **No keys inside:** the sandboxes get no API keys at all; Droid's key stays on the backend.
- **Why Droid itself isn't in the sandbox:** our Daytona tier blocks outbound traffic to Factory's domains (and refuses custom snapshots). So Droid works on the backend with redacted or fake data, and the sandbox runs what it wrote on the real data. Details in [Where Daytona works](#where-daytona-works).

## Honest limits

- **Droid runs on our backend, not in Daytona,** because of the network block above. It only ever gets redacted or fake data. But Droid and the scripts it tests while working run on the backend, and file reads never reach our permission handler. Our privacy test can detect an out-of-folder read; nothing prevents one. In one earlier run, Droid's `LS` tool was pointed at three folders just outside its own (they didn't exist, and nothing was read), and the privacy test flagged it. Every prompt now gives Droid its folder as absolute paths and says to stay inside it. **That rule held on a live run:** in the latest live run of both flows, the privacy test passed 8 of 8, and all 26 of Droid's file-tool calls across the three jobs used absolute paths inside its own folder. That's one run: the rule makes a stray read less likely, and the test catches one after the fact, but neither stops it.
- **The redacted copy leaves the sandbox.** It reveals the export's structure, text lengths, timestamps and short single-word fields such as model names. A field whose every value is one short word, such as one-word chat titles, would get through.
- **`insights.json` quotes up to 3 example prompts** (80 characters each) on the backend. That's the product.
- **We haven't restricted the sandbox's outbound network ourselves.** Droid-written code runs there on real data. Our tier blocks some domains, and we haven't checked what else it allows.
- **`footprint.py` has placeholder numbers,** clearly marked, until the real footprint model lands. No energy, water or CO₂ figure shown today is a real estimate.
- **The Chrome extension and the dashboard are placeholders on this branch.** Both flows are driven through the API, by the smoke test or by hand. The extension doesn't send `/adapter-failure` yet.
- **Only fake data:** every run used fake or planted exports and a cleaned test page. No real user's export has been through the system.
- **Droid's cost and reliability vary:** one Analyst run cost about 158,000 credits, some turns end on connection errors, and droid-sdk 0.5.0 can't handle Droid's `Script` tool (see [Known issues](#known-issues)). The demo has a replay fallback.
- **Each sandbox pip-installs its dependencies** (about 1 s), because our tier refuses custom snapshots.
- **No authentication** on the API; it's meant for one machine at a hackathon.

## Run it

```powershell
# first: install the packages and the droid CLI, and fill in .env (see Setup below)
py start.py                 # Daytona mode if DAYTONA_API_KEY is in .env, else local mode
py start.py --replay        # demo fallback: replay saved runs
py smoke_test.py            # the whole flow for both jobs, free (Droid's saved outputs), about 30 s
py smoke_test.py --live     # the same with real Droid calls (about 100,000 credits)
```

`smoke_test.py` starts the backend with `start.py` and runs the upload flow (upload → sandbox redact → Droid → sandbox real-data run → insights → audit) and the repair flow (break adapter → sandbox clean → Droid repair → checker → publish). Without `--live` it sets `DROID_SAVED_DIR` to [`backend/demo_runs/droid_outputs/`](backend/demo_runs/droid_outputs/): the `parser.py` and `analyze.py` Droid wrote in the Daytona rehearsal and the adapter it wrote in a saved repair stand in for Droid's calls. Everything else runs for real, including the sandboxes, redaction, our checks and publishing. It restores the published adapter afterwards. Latest results: without `--live`, 15/15 checks in Daytona mode and 11/11 in local mode, for 0 credits. With `--live` in Daytona mode, 13/13 checks in 437 s, for 65,302 credits: Ingestor 169 s and 31,832 credits, Analyst 176 s and 28,237, Mechanic 65 s and 5,233.

## Status

**All three Droid jobs run on a laptop, triggered through the backend; Droid itself never runs inside Daytona.** The FastAPI backend ([`backend/main.py`](backend/main.py)) starts the Ingestor and Analyst when a user uploads an export, and the Mechanic when the extension reports a capture failure. Each run is checked by our own code. Inside a Daytona sandbox Droid can't run: our tier blocks outbound traffic to Factory's domains (`app.factory.ai`, `api.factory.ai`, `downloads.factory.ai`) and refuses custom snapshots (403). So Daytona mode (the default whenever `DAYTONA_API_KEY` is set) runs a **hybrid**: the real export stays in a sandbox, Droid works on the backend with a redacted copy, and the code Droid wrote runs on the real export back in the sandbox (see [Where Daytona works](#where-daytona-works)). Below, anything not yet working is marked **planned**.

## Repo layout

| Path | What lives there |
| --- | --- |
| `start.py`, `smoke_test.py` | Start the backend in the right mode; run both flows end to end |
| `backend/` | FastAPI API and job executors, placeholder footprint model, published adapters, saved demo runs, Daytona sandbox flow and cleanup; planned: real footprint model, xAI voice recap |
| `sandbox_jobs/` | Job code, uploaded fresh into each sandbox at the start of every run |
| `sandbox_jobs/lib/` | Our own schema, validator, and adapter checker. Never written by Droid |
| `sandbox_jobs/standin/` | Hand-written stand-ins for Jobs 1 and 2 while Droid can't run |
| `sandbox_jobs/samples/` | Fake exports (ChatGPT, Claude-style, CSV, planted), a cleaned real ChatGPT page, `break_adapter.py`, `clean_snapshot.py`. Never uploaded to a sandbox |
| `extension/` | Chrome extension: per-site adapters; the TypeScript code is a placeholder on this branch |
| `web/` | Dashboard (placeholder on this branch) |
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

Droid can't reach Factory from inside a Daytona sandbox, so in Daytona mode Droid runs on the backend with redacted data and the scripts it writes run on the real export in the sandbox ([`sandbox_jobs/run_real.py`](sandbox_jobs/run_real.py)). [`sandbox_jobs/run_jobs.py`](sandbox_jobs/run_jobs.py) still runs the hand-written stand-ins, and `run_jobs.py --droid` runs the real jobs locally.

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
- **In Daytona mode:** Droid writes the parser on the backend from the redacted copy, and the parser runs on the real export in the sandbox (see [Where Daytona works](#where-daytona-works)).
- **Planned:** a real ChatGPT export; Gemini Takeout.

### Job 2: The Analyst

- **Trigger:** a successful ingest, in the same `POST /upload` job (planned: also weekly).
- **Through the backend:** an upload of the fake ChatGPT sample succeeded end to end. Ingest hit the cache (0 credits), and the Analyst passed all four checks in about 220 s and 31,149 factory_credits; `/insights/latest` then served its tips. **Its cost varies a lot:** an earlier upload spent 157,839 credits, mostly in 8.5 minutes of Droid thinking, and then failed when Droid used its `Script` tool (see [Known issues](#known-issues)).
- **What Droid does (implemented, laptop):** [`sandbox_jobs/analyze.py`](sandbox_jobs/analyze.py) copies `footprint.py`, [`insights_schema.json`](sandbox_jobs/lib/insights_schema.json) and our [`validate_insights.py`](sandbox_jobs/lib/validate_insights.py) into `work/lib`, then calls `run_droid_job("analyze", PROMPT, output_model=AnalystSummary)`. Droid writes `work/droid/analyze.py`, a pandas analysis that checks for repeated questions, regenerate loops, long answers to short asks, image or video spikes and time-of-day patterns, and keeps the 3 with the biggest estimated savings. Every energy, water and CO2 number comes from calling [`backend/footprint.py`](backend/footprint.py).
- **Output:** `insights.json`: totals (energy, water, CO2 as low/high ranges) and exactly 3 tips, each with real counts, up to 3 example prompts truncated to 80 characters, estimated savings and a one-sentence fix. This, the job summary, and the logs are the only things that leave the sandbox.
- **Independent verification (implemented):** after Droid finishes, `analyze.py` runs four checks, and any failure fails the job: (1) `footprint.py`'s SHA-256 is unchanged; (2) `insights.json` passes our validator, which checks the schema, low ≤ high and unique ids; (3) re-running Droid's script from scratch gives identical output, ignoring `generated_at`; (4) Droid's script imports `footprint` and has no number literals on lines about energy, water or carbon (0–3, percentages, and values passed straight into a `footprint` call are allowed). [`sandbox_jobs/check_footprint_sensitivity.py`](sandbox_jobs/check_footprint_sensitivity.py) re-runs Droid's script with footprint ranges doubled, without calling Droid, to prove the numbers really come from `footprint.py`.
- **Tested on the fake ChatGPT sample with a planted pattern** ([`samples/chatgpt_planted`](sandbox_jobs/samples/chatgpt_planted/conversations.json): the same CSS question asked 4 times). All four checks passed, and the planted pattern was tip 2. Doubling the medium-model range doubled the savings of the two tips on those models and left the image tip unchanged; doubling every range doubled every savings number and the totals.
- **`footprint.py` is a placeholder:** [`backend/footprint.py`](backend/footprint.py) has the agreed signatures (`energy_wh`, `water_ml`, `co2_g`, `compare_models`) and **made-up placeholder ranges**, clearly marked, until Person D's real model replaces it. None of its numbers are real estimates.
- **Stand-in in the sandbox today:** [`sandbox_jobs/standin/analyze.py`](sandbox_jobs/standin/analyze.py) writes placeholder tips from counts only. It has no footprint numbers and never copies chat text. `py sandbox_jobs/run_jobs.py --droid` runs the real Ingestor then Analyst; without `--droid` it runs the stand-ins.
- **In Daytona mode:** Droid writes `analyze.py` on the backend, and it runs on the real `prompts.jsonl` in the sandbox, where the four checks are repeated. The sandbox tarball includes `footprint.py`.
- **Planned:** the real footprint model; weekly runs.

### Job 3: The Mechanic

- **Trigger:** the extension fails to capture a prompt because the site's page layout changed, and reports it with `POST /adapter-failure`.
- **What Droid does (implemented, laptop):** [`sandbox_jobs/repair_adapter.py`](sandbox_jobs/repair_adapter.py) copies the page snapshot, its `expected.json`, the broken adapter and our checker into `work/mechanic`, then calls `run_droid_job("repair", ...)` with Droid's default tools. Droid searches the snapshot with small scripts, picks selectors on stable attributes (`role`, `aria-label`, `contenteditable`, `type`, meaningful `data-*`) rather than class names or generated ids, writes a fixed adapter with the version bumped by 1, and runs our checker until it passes.
- **Output:** a new adapter JSON. `repair_adapter.py` publishes it only if our checker passes, the keys are unchanged, and the version is exactly one higher and above what's already published. It does a PUT to the backend's `/adapters/{site}` if the backend answers, and otherwise writes [`backend/adapters/<site>.json`](backend/adapters/chatgpt.json). `--no-publish` skips publishing. The extension hot-loading it is planned (extension milestone M4).
- **Independent verification (implemented):** [`sandbox_jobs/lib/check_adapter.py`](sandbox_jobs/lib/check_adapter.py) checks an adapter against a snapshot with BeautifulSoup. The prompt box must match exactly one element containing the expected prompt text, the send button and responses must match, and the model name must have non-empty text (equal to the expected model if one is given). [`sandbox_jobs/samples/break_adapter.py`](sandbox_jobs/samples/break_adapter.py) breaks selectors on purpose for testing and the demo.
- **Tested on a real ChatGPT page** ([`samples/chatgpt_page/`](sandbox_jobs/samples/chatgpt_page/)), saved from a Temporary Chat and cleaned with [`samples/clean_snapshot.py`](sandbox_jobs/samples/clean_snapshot.py). The cleaning removes scripts, styles, images, metadata, the sidebar, conversation links, id attributes and email addresses; it took the page from 799,847 to 41,486 characters, and the visible text left is only interface labels and the test chat. The raw capture stays gitignored. The working adapter passed; `break_adapter.py` broke `prompt_box` and `send_button`, and the checker failed on exactly those two. Droid repaired both on the first try, leaving the other two unchanged, in 71 s and 4,881 factory_credits. Our checker passed and the adapter was published as v2.
- **The model name isn't on the page:** in this capture the model picker reads "Thinking effort Medium", and the model's name (ChatGPT 6) doesn't appear anywhere in the page's HTML. So `expected.json` sets `model` to `null`, and the model check only requires non-empty text. Capturing the model name will need another source, such as the picker's open menu.
- **Timed 3 times** (CLI, `--no-publish`, same broken adapter and page): 86.0 s, 60.3 s and 76.0 s wall clock; 4,868, 4,987 and 4,961 factory_credits. Droid fixed both selectors and our checker passed each time. Through the backend, two more repairs took 34 s and 47 s (12,738 and 10,880 credits). **That's over the demo's 30-second slot**, so the demo should either give the live repair about 90 seconds or use the replay (see [Demo fallbacks](#demo-fallbacks)).
- **In Daytona mode:** the raw page snapshot is cleaned inside a short-lived sandbox, and only the cleaned page comes back for Droid (see [Where Daytona works](#where-daytona-works)).
- **Planned:** agreeing the selector key names with the extension owner (the extension's `chatgpt.json` is still a placeholder).

### Backend triggers

[`backend/main.py`](backend/main.py) (FastAPI). Run it with `py -m uvicorn backend.main:app`.

| Route | What it does |
| --- | --- |
| `POST /upload` | Multipart chat export. Creates a job and returns `{job_id}` at once (0.09 s in testing); ingest then analyze run in the background |
| `GET /jobs/{job_id}` | Status (`queued`, `running`, `succeeded`, `failed`), summary (counts, check results, credits) and error |
| `GET /jobs/{job_id}/audit` | Daytona mode: the job's sandbox id, created and deleted times, and every file uploaded into it or downloaded from it, by name and size only |
| `GET /jobs/{job_id}/logs` | Server-Sent Events: each new line of the job's Droid log as it's written, then an `end` event with the final status. Lines arrived live, spread over the run, not in one burst |
| `GET /insights/latest` | The latest successful analysis's `insights.json` |
| `POST /adapter-failure` | `{site, failed_keys, adapter_version, snapshot_html}`, plus optional `adapter`, `expected_prompt` and `has_responses`. Starts a repair. A report for an adapter older than the published one is ignored, and a report while a repair for that site is queued or running returns that job's id instead of starting another (tested with two simultaneous reports) |

- **Jobs sit behind an executor interface** ([`backend/executor.py`](backend/executor.py)): `JobExecutor` with `run_ingest_and_analyze` and `run_repair`. `LocalExecutor` runs the `sandbox_jobs` scripts in a fresh `work/jobs/<job_id>/` per job. The hybrid `DaytonaExecutor` is used when `DAYTONA_API_KEY` is set and `LocalExecutor` when it isn't; `EXECUTOR=local` or `EXECUTOR=daytona` overrides, and `DEMO_REPLAY=1` picks `ReplayExecutor` (`active_mode` in `executor.py`; see [Where Daytona works](#where-daytona-works)).
- **Job records** are kept in SQLite ([`backend/jobs.py`](backend/jobs.py), `backend/jobs.sqlite`, gitignored).
- **One Droid job at a time,** using an asyncio lock; others wait as `queued`. Jobs run in a worker thread, so requests are still answered while Droid works (`GET /jobs` took 0.01 s during a run).
- **Privacy in local mode:** when an upload job finishes, its export and its extracted `prompts.jsonl` are deleted. A repair's raw page snapshot goes through `clean_snapshot.py` before Droid sees it, and is then deleted. The job scripts' console output isn't kept, since it can include insight titles about the user's data.

### Demo fallbacks

Droid jobs take minutes and, as above, sometimes end on a connection error. So every live Droid step has a saved, replayable fallback:

- **Saved runs:** [`backend/demo_runs/upload/`](backend/demo_runs/upload/) holds a successful upload: the Analyst's log, `insights.json`, and the `prompts.jsonl` rebuilt from the fake sample. [`backend/demo_runs/repair/`](backend/demo_runs/repair/) holds a successful repair: its log, the broken and fixed adapters, and the job summary. Both came from fake data. [`backend/save_demo_run.py`](backend/save_demo_run.py) saves any succeeded job.
- **Replay mode:** start the backend with `DEMO_REPLAY=1`. `/upload` and `/adapter-failure` then replay a saved run instead of calling Droid: the saved log lines are written into the new job's log at their original pace, so `/jobs/{id}/logs` streams exactly as it would live. The saved insights or adapter are then put in place, and the repaired adapter is published one version above the current one, so the extension picks it up. The job summary says `"replayed": true`. `REPLAY_SPEED=10` speeds it up.
- **Tested:** the repair replay streamed in 34.2 s, against 33.8 s for the original run. The upload replay at 10× streamed 155 lines in 22.1 s (about 221 s at real speed, against 219.5 s originally), and `/insights/latest` served the saved tips.
- **Daytona mode:** when `DAYTONA_API_KEY` is set too, uploads replay the saved Daytona run, including its sandbox log and audit (see [Audit, replay and cleanup](#audit-replay-and-cleanup-d7)).
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
| Path-restricted permissions | Implemented in `droid_runner.py`. Our permission handler approves file writes only inside `work/droid` and `work/output`. It approves commands only if every part (split on `&&` or `;`) is `python`/`py`/`pytest` on files inside `work/`, or a `cd` into `work/`. `python -c`, pipes, redirects and other programs are refused, and the reason is logged. The session runs at autonomy `OFF` so every edit and command reaches the handler; higher levels let Droid run them without asking. In Daytona mode, the sandbox is the boundary for Droid's scripts when they run on real data; Droid itself, working on redacted data, is bounded only by these rules |
| Read-only `lib/` and `input/` folders | Implemented: Droid can't write there, the Ingestor prompt says never to modify them, and `droid_runner.py` fingerprints both folders before and after each job and fails the job if either changed. That catches a script Droid wrote and ran that writes there, which the per-action check can't see |
| `footprint.py` never edited, and the only source of numbers | Implemented: SHA-256 checked after each Analyst run, a scan for hard-coded energy, water and carbon constants in Droid's script, and a doubling test showing the savings follow `footprint.py` |
| Droid never sees real chat text | Implemented in both modes: Droid gets only the redacted export, fake prompts and counts. On the latest live Daytona-mode run of the planted sample, the privacy test passed 8 of 8: no marker word reached Droid, and its file tools stayed inside its folder (an earlier run had failed that check once, before the folder rule): see [Privacy](#privacy) |
| Raw chat history never on the backend's disk | Daytona mode only. The export is read into memory (no `UploadFile` temp file) and uploaded to the sandbox; `prompts.jsonl` and the export are never downloaded; the raw page snapshot for repairs is cleaned in a sandbox too. `/jobs/{id}/audit` lists every file in and out. Checked on the rehearsal: no marker word anywhere in the job's backend folder outside the returned `insights.json`, which quotes example prompts by design. In local mode the export sits in `work/` during the job and is deleted after |
| No leaked sandboxes | Implemented: deleted in `finally`; ephemeral, with auto-stop and a time limit; labeled, and `cleanup_sandboxes.py` deletes leftovers. Tested by killing the backend mid-job: cleanup found and deleted the sandbox |
| No chat text in logs | Implemented: `droid_runner.py` logs message types, tool names, file paths, commands and assistant text capped at 200 characters. Tool results are logged by name and error flag only, never their content. The stand-ins log only events and counts |
| Unattended runs | Implemented: if Droid asks a question, `droid_runner.py` declines it and logs it, and Droid proceeds from the prompt. A refused action ends Droid's turn, so the runner sends up to 2 follow-up turns in the same session saying what was refused, and Droid carries on |
| Scripts Droid runs | Partly covered. In Daytona mode, Droid's scripts run on real data only inside the sandbox. But Droid itself, and the scripts it tests while working on redacted data, run on the backend, where a script can do anything the user running it can. The `lib/` and `input/` fingerprint check catches writes there after the fact. In local mode everything runs on the laptop |

### Privacy

**Goal:** Droid never sees a user's real chat text. Droid sends what it reads to a model provider, so anything it sees leaves the machine.

**Status: the latest live Daytona-mode run on the planted sample passed the privacy test 8 of 8.** That run was `py smoke_test.py --live`, through `/upload` (see [Where Daytona works](#where-daytona-works)). The Ingestor and Analyst both passed, for 60,069 factory_credits. No marker word reached Droid in either job, or reached the backend's disk outside the returned `insights.json`. Every one of Droid's file-tool calls used an absolute path inside its own folder: 9 in the Ingestor, 13 in the Analyst, and 4 in the Mechanic's repair, which the test doesn't cover and was checked the same way by hand. **The folder rule held.** The rehearsal before it failed one check: Droid's `LS` was pointed at `lib`, `input` and `output` one level above its own folder (they didn't exist, and all three calls returned errors). That's why every prompt now gives Droid its folder as absolute paths and says to list, search or read only inside it. File reads and listings still never reach our permission handler, so a stray read can be made less likely and detected, not prevented. In local mode, the last full run on the planted sample had its Ingestor pass and its Analyst end on a connection error; all 7 local-mode checks passed on that run's files. The other results quoted for Jobs 1 and 2 above came from earlier runs, before the privacy change, where Droid worked directly on the fake samples.

How it works (all in `sandbox_jobs/`):

- **Droid works only in its own folder,** `droid_view/ingest` or `droid_view/analyze`, outside `work/`. Its permission rules only allow writes and Python commands inside that folder. Our code then copies the script Droid wrote into `work/` and runs it on the real data itself, without Droid.
- **Ingestor:** Droid gets a redacted copy of the export ([`lib/redact.py`](sandbox_jobs/lib/redact.py)). The copy has the same structure, and therefore the same fingerprint, but every text value is replaced by `"<text N chars>"`. Kept: numbers, booleans, keys, timestamps, empty strings, and fields whose every value is a short single token (roles, content types, model names, IDs that link messages). Anything with a space, `@` or `://` is replaced. Tested on all four samples: the fingerprint was unchanged, no marker word survived, and the existing parsers produced identical counts, kinds, models and timestamps on the redacted copy and the real file. `ingest.py` then runs Droid's `parser.py` on the real export, runs our validator, and requires the counts to match the redacted run.
- **Analyst:** Droid gets our schemas, `footprint.py`, the fake sample's `prompts.jsonl` and an `aggregates.json` of the real data (counts per model, day and kind, regenerations, prompt and response lengths). It never gets the real prompts. `analyze.py` runs Droid's script on the real `prompts.jsonl` and applies its four checks there.
- **Droid's default tools:** these jobs use the same tool settings as F2 and F3, with no tool lists. Droid may use Read and Grep, but the folder it works in holds only redacted or fake data, and every prompt ends with a rule giving that folder as absolute paths and saying to list, search or read only inside it (`FOLDER_RULES` in `droid_runner.py`, added after Droid listed folders just outside its own in one run). File reads never reach the permission handler, so a Read given an absolute path could still open another file on the machine; the privacy test is what checks that nothing real reached Droid. The permission handler refuses anything it can't check, such as a subagent's request, instead of crashing.
- **Our checks decide success:** each job judges the files Droid wrote with our own checks, not by how Droid's turn ended, because a turn can end in a connection error after the work already passes. A changed protected folder still always fails.
- **Full transcripts:** `work/logs/<job>.transcript.jsonl` records everything Droid sent and received: prompts, messages, tool inputs, tool results and its final output.
- **Privacy test:** [`test_privacy.py`](sandbox_jobs/test_privacy.py). The planted sample contains marker words ([`markers.txt`](sandbox_jobs/samples/chatgpt_planted/markers.txt)) that appear nowhere in the data Droid may see. After an end-to-end run, the test first checks that the markers are in the real data (a control). It then fails if any marker appears in Droid's logs, transcripts or folders, or if Droid's file tools (Read, Grep, LS, Glob) were pointed outside its folder. Run it with `py -m pytest sandbox_jobs/test_privacy.py`. For a Daytona-mode job, set `PRIVACY_MODE=daytona`, `WORK_DIR=work/jobs/<id>` and `DROID_VIEW_DIR=droid_view/jobs/<id>`. It then checks the uploaded planted sample as the control, and also fails if any marker is anywhere in the job's backend folder other than the returned `insights.json`.

**How we got here:** we first tried turning Read and Grep off. In the SDK, turning off *any* tool also removed Droid's file-writing tools. With the needed tools listed explicitly, Droid worked blind, fell back on shell writes and subagents, and once ended its turn without doing anything. Those attempts cost over 68,000 factory_credits, plus one timed-out run that reported no cost. With the default tools, Droid did the work. The two runs since then each ended on a connection error: the first after the Ingestor's parser had passed (before our checks were the deciding factor), and the second in the Analyst.

**Limits, stated plainly:**
- Nothing stops a Python script Droid writes, or a file tool given an absolute path, from opening other files on this laptop. The separate folder, the prompt and the privacy test reduce and detect that; they don't prevent it. Droid can't run inside a Daytona sandbox on our tier, so this applies in Daytona mode too. What Daytona mode changes is that the backend holds no real chat text to find.
- Redaction keeps fields whose every value is one short word, so a one-word title in every conversation would get through. Lengths of replaced text are visible.
- `aggregates.json` and the kept token fields reveal model names, dates and volumes. They reveal no text.

## Where Daytona works

**Droid itself does not run in Daytona.** Our tier blocks Factory's domains from inside a sandbox, so Daytona mode (the default when `DAYTONA_API_KEY` is set, or `EXECUTOR=daytona`) runs a **hybrid**: the sandbox holds the user's real export and runs the code Droid wrote on it, and Droid runs on the backend machine with only a redacted copy. This is the fallback the plan describes, not the original "Droid in every sandbox" design.

### The hybrid upload flow (Daytona mode)

[`DaytonaExecutor`](backend/executor.py) calls `run_hybrid_jobs` in [`backend/sandbox.py`](backend/sandbox.py). For each upload:

1. **Redact in the sandbox.** `/upload` reads the export into memory (50 MB cap, 413 above it; FastAPI's `UploadFile` isn't used, because it spills files over 1 MB to a temp file). The backend uploads the export straight from memory into a fresh sandbox, runs [`lib/redact.py`](sandbox_jobs/lib/redact.py) there, and downloads **only the redacted copy**.
2. **Droid on the backend, redacted data only.** `ingest.py` then `analyze.py` run with `REDACTED_INPUT=1`. The Ingestor gets the redacted copy, exactly as in local mode, and the Analyst gets fake prompts plus counts of the redacted parse; placeholder lengths stand in for text lengths. Our validator and the Analyst's four checks run here too, on the redacted data, as a first pass. Droid, and the scripts it tests while working, run on this machine, not in the sandbox.
3. **Droid's code on the real export, in the sandbox.** The backend uploads the `parser.py` and `analyze.py` Droid wrote. [`run_real.py`](sandbox_jobs/run_real.py) runs them on the real export with our validator, requires the counts to match the redacted run, and repeats the Analyst's four checks on the real data. Only `insights.json` and `summary.json` (counts, check results, timings, the structure fingerprint) are downloaded. **`prompts.jsonl` and the export are never downloaded.** A parser is cached only after it passes here.
4. **Delete.** The sandbox is deleted in `finally`, whatever happened.

The job summary records the sandbox id, per-step timings, and an audit of every file uploaded to and downloaded from the sandbox, by name and size. Sandbox events stream through `/jobs/{id}/logs` alongside Droid's log. Up to 3 uploads run at once in this mode, each in its own sandbox (local mode runs one at a time).

**Full rehearsal through `/upload`** (backend started with `EXECUTOR=daytona`, the planted sample posted as multipart, and `PARSER_CACHE` pointed at an empty folder, so Droid wrote a new parser). The job succeeded in 7 min 18 s and cost **99,837 factory_credits**: the Ingestor 158 s and 39,403 credits, the Analyst 60,434. Droid's parser found 12 exchanges, 1 regeneration and 1 image in the real export, matching the redacted run, and all four Analyst checks passed on the real data in the sandbox. Sandbox timings: create 0.87 s, pip install 1.02 s, code upload 0.35 s, export upload 0.16 s, redact 0.33 s, Droid on the backend 428 s, script upload 0.42 s, run on the real export 3.62 s, download 0.22 s, delete 0.09 s. That's about 8 s of sandbox work spread over the 7 minutes the sandbox waited. `/jobs/{id}/logs` streamed 369 lines spread over 126 different seconds, including the sandbox's own events, with no marker word in any of them. `/jobs/{id}/audit` showed what went in (job code 41 KB, export 41 KB, `parser.py` 23 KB, `analyze.py` 31 KB) and what came out (the redacted copy 31 KB, `insights.json` 2.9 KB, `summary.json` 0.9 KB). This run is kept as a backup demo run, [`backend/demo_runs/upload_daytona_rehearsal/`](backend/demo_runs/upload_daytona_rehearsal/).

**Privacy test on that run** (`PRIVACY_MODE=daytona`): 7 passed, 1 failed, 1 local-only control skipped. No marker word appeared in Droid's logs, transcripts or folders, or anywhere in the job's backend folder outside the `insights.json` that came back. That `insights.json` quotes `ZEBRAQUARTZ` from the planted repeated question, which shows the real text was processed, in the sandbox. **The failure:** in the Analyst job, Droid ran `LS` on `lib`, `input` and `output` one level above its own folder (it resolved `../` from the wrong place). Those folders don't exist, all three calls returned errors, and in Daytona mode no real data is on the backend to find, but the test is right that Droid's file tools left its folder. File reads never reach our permission handler, so this can only be detected, not prevented (see [Privacy](#privacy)). Every prompt now pins Droid to its folder with absolute paths.

**Live run after the folder rule** (`py smoke_test.py --live`, Daytona mode, empty parser cache): 13/13 checks passed in 437 s, for **65,302 factory_credits**: Ingestor 169 s and 31,832 credits, Analyst 176 s and 28,237, Mechanic 65 s and 5,233. There were no connection errors. One command was refused (Droid tried to delete its scratch scripts with PowerShell's `Remove-Item`), and Droid carried on in a follow-up turn. Upload sandbox: create 1.34 s, pip install 0.88 s, code upload 0.19 s, export upload 0.07 s, redact 0.22 s, Droid on the backend 350 s, script upload 0.23 s, run on the real export 3.45 s, download 0.16 s, delete 0.14 s. Repair sandbox: create 0.70 s, pip install 0.67 s, upload 0.15 s, clean 0.25 s, download 0.09 s, delete 0.09 s. **Privacy test: 8 of 8 passed**, and all 26 of Droid's file-tool calls stayed inside its folder. This run is the Daytona demo run, [`backend/demo_runs/upload_daytona/`](backend/demo_runs/upload_daytona/).

An earlier test run found and fixed a bug: `analyze.py` clears `droid/`, deleting the parser the Ingestor left there, so the jobs now run as two separate steps (that run's 88,827 credits produced no result).

**What this does and doesn't prove.** The user's real chat text never touches the backend's disk; the planted-marker test checks that (`PRIVACY_MODE=daytona`, see [Privacy](#privacy)). It does **not** keep Droid's code off the backend: Droid and its test runs work here, on redacted data. In the sandbox, the untrusted code Droid wrote runs on the real data, which is the part the sandbox is for. The redacted copy does leave the sandbox, and it reveals structure, lengths, timestamps and short token fields such as model names (see the limits under [Privacy](#privacy)). The `insights.json` that comes back quotes up to 3 example prompts (80 characters each), because that's the product.

### The hybrid repair flow (Daytona mode)

The same split as uploads. The page snapshot the extension sends with `POST /adapter-failure` is a raw capture, which can hold the account's email, sidebar chat titles and data in `<script>` tags. In local mode the backend writes it to disk briefly to clean it; in Daytona mode it never touches the backend's disk. `DaytonaExecutor.run_repair` calls `clean_snapshot_in_sandbox` in [`backend/sandbox.py`](backend/sandbox.py):

1. **Clean in the sandbox.** The raw snapshot is uploaded from memory into a fresh sandbox along with [`clean_snapshot.py`](sandbox_jobs/samples/clean_snapshot.py), which runs there. If an email or conversation link is left after cleaning, the job fails and nothing is downloaded. Otherwise **only the cleaned page comes back**, plus the cleaner's report (counts and sizes only).
2. **Delete.** The sandbox is deleted in `finally`, before Droid starts.
3. **Droid on the backend, cleaned page only.** From here it's the local repair: [`repair_adapter.py`](sandbox_jobs/repair_adapter.py) has Droid fix the adapter from the cleaned page, then runs **our** [`check_adapter.py`](sandbox_jobs/lib/check_adapter.py) on the backend. It publishes only if the checker passes, the keys are unchanged, and the version is one higher than the broken one and above what's published.

**Tested** with the raw saved ChatGPT capture (800 KB, gitignored, with one email-like string) and the published v2 adapter broken by [`break_adapter.py`](sandbox_jobs/samples/break_adapter.py) (`prompt_box` and `send_button`). The sandbox cleaned the page to 41,486 characters, with 0 email-like strings and 0 conversation links left, and only that page was downloaded. Droid fixed both selectors in 62.5 s and 5,610 factory_credits, our checker passed, and v3 was published (then reset to v2 in the repo). Sandbox timings: create 0.86 s, `pip install beautifulsoup4` 0.65 s, upload 0.20 s, clean 0.26 s, download 0.08 s, delete 0.05 s: about 2 s of sandbox life in a 69 s job. Afterwards, no email-like string and no raw snapshot was in any file in the job's backend folders. **Failure path, tested at no cost:** a first version of the cleaner removed conversation links only from `<a>` tags, so a link on an `<area>` tag survived cleaning. The final check caught it and failed closed. The cleaner now removes any attribute, on any tag, whose value holds a conversation or project link: rerun in the sandbox, the `<area>` link was stripped and cleaning passed. Text isn't rewritten, so a conversation URL in plain text still fails the final check. Rerun as a full repair, nothing was downloaded, Droid didn't run, nothing was published, the sandbox was deleted, and the only file the job left on the backend was its sandbox log. The raw ChatGPT capture still cleans to the same 41,486 characters. Not done from the D6 plan: running Droid itself in the sandbox (blocked, as above) and the warm-sandbox option, which matters less here since the sandbox's part takes about 2 s.

### Audit, replay and cleanup (D7)

- **`GET /jobs/{job_id}/audit`:** for a Daytona-mode job, the sandbox id, when it was created and deleted, and every file uploaded into it and downloaded from it, by name and size only. For a local job these fields are null. For a replayed job they're the saved run's, with `"replayed": true`.
- **Replay in Daytona mode:** with `DEMO_REPLAY=1` (`py start.py --replay`) and `DAYTONA_API_KEY` set, `/upload` still reads the upload into memory, and the job replays [`demo_runs/upload_daytona/`](backend/demo_runs/upload_daytona/): the sandbox, Ingestor and Analyst logs, interleaved by timestamp at their original pace, then the saved insights, summary and audit. Tested at `REPLAY_SPEED=50` with the rehearsal run: 368 lines in 10 s (7.3 minutes live). It now replays the live run after the folder rule; the rehearsal is kept in `demo_runs/upload_daytona_rehearsal/` (to replay it, copy it over `upload_daytona/`). `/jobs/{id}`, `/jobs/{id}/audit` and `/insights/latest` served the saved run. Save a Daytona upload with `py backend/save_demo_run.py upload_daytona JOB_ID`. It saves no `prompts.jsonl`, since the backend never had one. Repairs replay the existing `demo_runs/repair/`.
- **Crash test:** a backend process killed mid-job (`os._exit`, so no `finally` ran) left its sandbox, with the export inside, running. `py backend/cleanup_sandboxes.py --max-age-minutes 0` found it by its label, deleted it, and then listed none left. Without the cleanup script, the sandbox's own auto-stop (30 minutes; it's ephemeral, so stopping deletes it) and its 60-minute time limit would remove it.

### Shared by every sandbox

- **One fresh sandbox per job,** created from Daytona's default image.
- **Keys only via `env_vars`** at sandbox creation: never baked into an image, written to a file, or put in a command string. The hybrid sandbox gets no Factory key at all, since Droid doesn't run there.
- **The raw export is uploaded from memory** and never written to the backend's disk.
- **Only listed files come back.** Fixed lists in `sandbox.py` say what may be downloaded; `prompts.jsonl` and the uploaded export are never on them.
- **Sandboxes are deleted after each job,** in a `finally` block, including after errors and timeouts (10-minute limit for the in-sandbox run). As a backstop, each sandbox is ephemeral and has auto-stop and a time limit: 15 idle minutes and 20 minutes for the stand-in flow, 30 and 60 for the hybrid, whose sandbox waits while Droid works (the backend pings it every minute so it doesn't auto-stop). Each is labeled `app=promptprint` plus its `job_id`, and [`backend/cleanup_sandboxes.py`](backend/cleanup_sandboxes.py) deletes any labeled sandbox older than 60 minutes, never touching anything else.
- **Live logs:** in-sandbox scripts run as a Daytona session command, and each log line streams to the backend as it's printed.
- **Dependencies are pip-installed at the start of each run** in a default sandbox. [`sandbox_jobs/build_snapshot.py`](sandbox_jobs/build_snapshot.py) is ready for a prebuilt snapshot, but our tier refuses snapshot creation (403).

### The stand-in flow (`run_user_jobs`)

Before the hybrid, [`run_user_jobs`](backend/sandbox.py) ran hand-written stand-in jobs entirely inside the sandbox, to build the plumbing (upload, validation, log streaming, cleanup) without Droid. It's still there, tested with [`backend/try_sandbox_flow.py`](backend/try_sandbox_flow.py). Measured on the fake sample: sandbox creation about 0.8–0.9 s, and the whole run, from create to delete, 2.6–4.1 s.

## Coaching backend setup

Requires Python 3.12+. On Windows, use `py` if `python` opens the Microsoft Store.

```
py -m pip install daytona droid-sdk python-dotenv jsonschema beautifulsoup4 pytest pandas fastapi uvicorn python-multipart
```

Install the droid CLI (`irm https://app.factory.ai/cli/windows | iex` on Windows) and open a new terminal so `droid` is on PATH. Copy `.env.example` to `.env` and fill in the keys: `FACTORY_API_KEY` for Droid, `DAYTONA_API_KEY` for the sandbox flow.

```
py sandbox_jobs/smoke_droid.py                # Droid answers "OK"
py sandbox_jobs/try_runner.py                 # job runner: hello job works, write into lib/ is blocked
py sandbox_jobs/ingest.py                     # Droid Ingestor on the one export in work/input/
py start.py                                   # the backend; API docs at http://localhost:8000/docs
py smoke_test.py                              # both flows end to end, no Factory credits
```

Demo fallback: `py start.py --replay` (or `DEMO_REPLAY=1`) replays the saved runs instead of calling Droid.

```
py backend/try_sandbox_flow.py                # full sandbox run on the fake ChatGPT sample
py backend/try_sandbox_flow.py --delay 2      # slower stand-ins, to watch logs stream live
py backend/try_sandbox_flow.py --marker       # privacy check: a marker word in the export must not come back
py backend/cleanup_sandboxes.py --dry-run     # list leftover sandboxes (drop --dry-run to delete them)
py sandbox_jobs/lib/validate_prompts.py sandbox_jobs/samples/chatgpt_fake/prompts_example.jsonl
py sandbox_jobs/lib/check_adapter.py --adapter sandbox_jobs/samples/tiny_chatgpt/adapter.json --snapshot sandbox_jobs/samples/tiny_chatgpt/snapshot.html
```
The Chalk/Jev workstream now runs locally in explicit mock/shadow mode without credentials:

```sh
uv sync
uv run python -m scripts.chalk_doctor
uv run uvicorn backend.main:create_app --factory --host 127.0.0.1 --port 8000
```

Issue a one-use local pairing code with `uv run python -m scripts.pair_extension`. The API's interactive contract is at `http://127.0.0.1:8000/docs`.

See [the runnable mock and evaluation commands](docs/chalk-runbook.md), [later Chalk account setup](docs/chalk-setup.md), and [extension/dashboard/ingest contracts](docs/coaching-integration.md). Configuration is documented in `.env.example`; use `uv run --env-file .env ...` to load a local file explicitly.

The original product components above are planned teammate work. This implementation supplies the coaching backend/evaluation modules and a tested draft-lifecycle helper; it does not implement the DOM adapter, React dashboard, footprint coefficients, voice recap, or Droid/Daytona jobs. No real Chalk evaluation or measured energy saving is claimed.
