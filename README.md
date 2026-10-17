# Prompt Print

> Everyone here used AI today. Nobody knows what it cost. We built the app that tells you, and helps you cut it.

Prompt Print tracks your AI usage, shows the energy, water, and CO₂ behind it, and coaches you before you send a wasteful prompt. Factory's Droid does the heavy lifting inside the running app: it writes the code that reads each user's chat history, analyzes their habits, and repairs the browser extension when ChatGPT changes its page.

## Repo layout

| Path | What lives there |
| --- | --- |
| `backend/` | FastAPI API, Daytona sandbox flow, footprint model, xAI voice recap |
| `sandbox_jobs/` | Droid job scripts, copied into the Daytona snapshot |
| `extension/` | Chrome Manifest V3 extension (TypeScript) and per-site adapters |
| `web/` | React + Vite dashboard |
| `evals/` | Chalk evals: coaching safety and parser accuracy |
| `space/` | Precomputed data center time-lapses and GRACE charts |

## Where Droid works

Droid runs inside a per-user Daytona sandbox via the Python Droid SDK. Each job is triggered by a user action or a failure, never by us.

### Job 1: The Ingestor

- **Trigger:** the user uploads a chat export (ChatGPT `conversations.json`, Claude export, Gemini Takeout, or a CSV).
- **What Droid does:** inspects the file, writes a parser that converts it to our fixed schema, writes a test, and fixes errors until the test passes. Output is `prompts.jsonl`.
- **Code:** [`sandbox_jobs/ingest.py`](sandbox_jobs/ingest.py)

### Job 2: The Analyst

- **Trigger:** after ingest, and weekly.
- **What Droid does:** writes and runs pandas analysis over `prompts.jsonl` to find this user's waste patterns, using only `footprint.py` for numbers. Output is `insights.json` with the top 3 coaching tips.
- **Code:** [`sandbox_jobs/analyze.py`](sandbox_jobs/analyze.py)

### Job 3: The Mechanic

- **Trigger:** the extension fails to capture a prompt because the site's page layout changed.
- **What Droid does:** takes the failing page snapshot, rewrites that site's adapter, and tests it against the snapshot until it extracts the prompt correctly. The extension hot-loads the new adapter.
- **Code:** [`sandbox_jobs/repair_adapter.py`](sandbox_jobs/repair_adapter.py)

## Coaching backend setup

The Chalk/Jev workstream now runs locally in explicit mock/shadow mode without credentials:

```sh
uv sync
uv run python -m scripts.chalk_doctor
uv run uvicorn backend.main:create_app --factory --host 127.0.0.1 --port 8000
```

Issue a one-use local pairing code with `uv run python -m scripts.pair_extension`. The API's interactive contract is at `http://127.0.0.1:8000/docs`.

See [the runnable mock and evaluation commands](docs/chalk-runbook.md), [later Chalk account setup](docs/chalk-setup.md), and [extension/dashboard/ingest contracts](docs/coaching-integration.md). Configuration is documented in `.env.example`; use `uv run --env-file .env ...` to load a local file explicitly.

The original product components above are planned teammate work. This implementation supplies the coaching backend/evaluation modules and a tested draft-lifecycle helper; it does not implement the DOM adapter, React dashboard, footprint coefficients, voice recap, or Droid/Daytona jobs. No real Chalk evaluation or measured energy saving is claimed.
