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

## Setup

TODO

Copy `.env.example` to `.env` and fill in the keys.
