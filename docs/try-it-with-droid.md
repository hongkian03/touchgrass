# Run the coaching and Droid evaluations

The local `.env` now points at `artifacts/live-eval-v1/profile.json` and
`policy.json`. It uses live inference with a shadow policy: no user-facing model
switch suggestions. Those private files and all generated results are ignored by Git.
Teammates must configure their own credentials; never send them your `.env`.

Configured roles: Jev (`jev-latest`, pinned response `jev-1.13.0`), Haiku 4.5
(`anthropic/claude-haiku-4-5-20251001`), Sonnet 5.5
(`anthropic/claude-sonnet-5-5`), and judge `openai/gpt-6.1-sol`.
Only Jev's live response was confirmed in the setup conversation. The other
request IDs, generation options, and resolved identities still need verification.

## 1. Verify the four routes when ready

Run from the repository root. Commands using `.env` load credentials into the
process; do not source the file or print its contents. Clear stale exported
configuration if it overrides `.env` in your terminal.

```sh
uv sync --extra eval
uv run --env-file .env python -m scripts.chalk_doctor
uv run --env-file .env python -m scripts.verify_models --execute
```

The doctor is offline; `verify_models --execute` makes four billed requests, one
per role, and writes sanitized outcomes to
`artifacts/live-eval-v1/model-verification.json`. A nonzero exit means at least one
role failed. A timeout is a failed check, not proof the model is unavailable.
Check the judge's resolved identity against what Chalk supplied. Do not silently
accept a different model. The catalog can show prefixed Jev IDs even though the
verified native System One request uses the unprefixed ID.

Anthropic calls start with `max_tokens=2048` and omit temperature. The judge uses
`max_completion_tokens=4096` and omits temperature. These settings are provisional
until the smoke calls succeed. Update the profile for route-specific requirements,
increment its version and regenerate its fingerprint into the policy whenever
changing generation settings or capability descriptions. Jev's 700 ms deadline
is the existing application budget, not a measured guarantee.

## 2. Try coaching evaluation (does not require Droid agents)

Ten synthetic prompts are prepared in `artifacts/live-eval-v1/tasks.jsonl`.
Their references are unresolved and no mock answer labels remain. Some rows are
intentional unsupported-context stress cases. This is a wiring dataset, not a
representative benchmark. Calls below are billed and checkpoints persist usage.

```sh
uv run --env-file .env python -m evals.prepare --allow-live --dataset artifacts/live-eval-v1/tasks.jsonl --output artifacts/live-eval-v1/prepared.jsonl --checkpoint artifacts/live-eval-v1/preparation.db --provider-version-tag initial-route-v1 --max-calls 40 --max-input-tokens 100000
uv run --env-file .env python -m evals.run_local --allow-live --dataset artifacts/live-eval-v1/prepared.jsonl --split dev --output artifacts/live-eval-v1/dev-report.json --checkpoint artifacts/live-eval-v1/classifier.db --provider-version-tag initial-route-v1 --max-calls 10
```

Inspect `prepared.jsonl.manifest.json` for answers and judge results, and
`dev-report.json.rows.json` for classifier decisions. The candidate capability
description explicitly says it is an unmeasured hypothesis. Jev may abstain;
do not weaken that description or lower the threshold simply to force suggestions.
Judge labels need human review before use as benchmark evidence. The report's
savings remain unavailable. Existing review/tuning tools are documented in
`chalk-runbook.md`; do not tune against the held-out partition.

## 3. Ingestor contract for the Factory Droid teammate

Expose a **synchronous Python callable** importable from this repo:

```python
def ingest(*, source: str, attempt_id: str, disable_parser_cache: bool) -> dict:
    # Invoke the real Factory/Daytona Ingestor, wait for completion, and return:
    return {
        "attempt_id": attempt_id,
        "parser_hash": "sha256 of the parser source actually executed",
        "cache_used": False,  # report what happened, not what was requested
        "success_first_attempt": True,
        "repair_iterations": 0,
        "records": [],  # real normalized records, one per source exchange
    }
```

The return above is a contract illustration, not a usable agent implementation.
The function must wait for the real result; a job ID alone is insufficient. If the
agent API is async, the teammate's wrapper must await it before returning. Honor
`disable_parser_cache=True` by starting fresh parser generation for each attempt;
report any cache reuse honestly. Keep credentials inside the agent runner.

Each normalized record uses these names:

```json
{
  "source_exchange_id": "stable-source-conversation-and-turn-id",
  "ts": "2026-10-17T12:00:00Z",
  "provider": "anthropic",
  "model": "model ID present in the export",
  "kind": "text",
  "prompt_text": "exact original prompt",
  "response_text": "exact original response",
  "regenerated": false
}
```

Use null for unavailable source fields. IDs must be stable across attempts and
match the independently labeled reference, including separate branches and
regenerations. Timestamps require a timezone. Do not normalize away text
differences: current scoring compares text exactly. Adapter code may map the
teammate's native schema into this contract; do not change their parser format
merely to accommodate the evaluator.

Machine-readable contracts: `docs/ingest-attempt.schema.json` and
`docs/normalized-exchange.schema.json`. The outer attempt schema leaves records
as objects so malformed records can be counted; the Exchange schema defines each
record's expected shape.

Prepare a real export and a **separately human-labeled** reference array. Do not
generate the reference by copying the Ingestor output. Then substitute the
teammate's actual module and callable name below:

```sh
uv run --env-file .env python -m evals.parser_eval --source artifacts/export.json --reference artifacts/reference.json --runner teammate_module:ingest --output artifacts/parser-five-runs.json
```

This invokes the runner five times with unique attempt IDs. It reports field
accuracy, missing/extra exchanges, duplicates, invalid records, cache use, and
repair counts. Factory/Daytona execution can incur costs. For a first check of
an existing output file, score it without starting an agent:

```sh
uv run python -m evals.parser_eval --reference artifacts/reference.json --actual artifacts/normalized.json --output artifacts/parser-score.json
```

The Analyst and Mechanic jobs are not called by this parser evaluation. Their
application integration remains with the agent/backend owners. No fabricated
Droid implementation or automatic background jobs are added here.

## 4. Run the classifier evaluation on Chalk

This is optional for the first end-to-end attempt. The current remote runner
deploys the classifier and nine deterministic scorers. Answer generation and
judge labeling happen in step 2; the remote run consumes that prepared dataset.

Before running: authenticate the Chalk SDK/CLI in the intended environment,
enable Evaluations/Function queue and ensure an active deployment, and create a
Chalk environment secret named `CHALK_ROUTER_API_KEY`. A local `.env` or MCP login
does not automatically create that remote secret. Do not paste a key into shell
history; use the dashboard secret entry. Native remote hosting of the five Droid
attempts is not implemented; the local callback can call the teammate's hosted agents.

```sh
uv run --extra eval --env-file .env python -m evals.run_chalk --execute --dataset artifacts/live-eval-v1/prepared.jsonl --split dev --output artifacts/live-eval-v1/chalk-dev.json --provider-version-tag initial-route-v1 --max-calls 5 --max-input-tokens 50000
```

This deploys and incurs remote execution costs. Inspect row/scorer errors even
if the run says SUCCEEDED. Resume timeouts with the saved run ID using the
runbook, rather than submitting duplicate runs. No remote runs have been
performed as part of this setup.

## Local API/demo

```sh
uv run --env-file .env uvicorn backend.main:create_app --factory --host 127.0.0.1 --port 8000
```

Keep it on loopback. Pair the extension using `scripts.pair_extension` and set
exact `ALLOWED_ORIGINS` only when the extension origin is known. The API will not
suggest switches for this offline profile. The extension, dashboard, and real
agent endpoints still require their owners' integration; see
`docs/coaching-integration.md`. Nothing here constitutes a public hosted app.
