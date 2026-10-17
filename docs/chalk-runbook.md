# Prompt Print coaching runbook

## Verified scope and defaults

Implemented: shared classifier/policy, native System One and chat adapters, local session pairing, metadata-only API storage, owned/idempotent event transitions, bounded request handling, local preparation/review/evaluation/tuning/publication, Chalk deployment runner, parser scoring, and extension draft lifecycle helper.

The ten-row dataset is explicitly synthetic. Mock classifier outputs are keyed by fixture ID; unknown IDs return uncertain. Mock preparation has deliberate disagreements with classifier predictions and a both-answer-models-fail case. These are test fixtures, not benchmark results. Ordinary classification generates no small/large answers and never invokes the judge.

Live account calls and remote deployments have not been run. No footprint coefficients are available, so energy/water/carbon savings and dollar costs remain null. The full representative pilot, consented user data, human review, website/API equivalence, and live latency measurements remain later work.

## Reproducible mock pipeline

From the repository root:

```sh
uv sync --extra eval
uv run python -m scripts.chalk_doctor
uv run python -m evals.prepare --dataset evals/datasets/smoke.jsonl --output artifacts/prepared.jsonl --checkpoint artifacts/preparation.db
uv run python -m evals.review export --dataset artifacts/prepared.jsonl --output artifacts/reviews.json --random-count 3 --target-id smoke-3
```

The review export is an editable selection manifest. Inspect answers/judgments in `artifacts/prepared.jsonl.manifest.json`. Set `confirmed=true`, your reviewer ID, reason, and explicit adequacy values only for cases actually reviewed. Applying an unchanged export makes no human-review claims:

```sh
uv run python -m evals.review apply --dataset artifacts/prepared.jsonl --reviews artifacts/reviews.json --output artifacts/reviewed.jsonl
uv run python -m evals.run_local --dataset artifacts/reviewed.jsonl --split dev --output artifacts/dev-report.json --checkpoint artifacts/classifier.db
uv run python -m evals.tune --rows artifacts/dev-report.json.rows.json --output artifacts/tuned-policy.json --target 0.02 --min-support 20
```

The ten-row fixture cannot meet that minimum recommendation support, so this command produces a shadow policy. This is an expected result, not a failed integration. Threshold selection never promotes to approved, never calls a model, and rejects test-partition rows.

Freeze the selected policy before the held-out run:

```sh
COACHING_POLICY_PATH=artifacts/tuned-policy.json uv run python -m evals.run_local --dataset artifacts/reviewed.jsonl --split test --output artifacts/test-report.json --checkpoint artifacts/classifier.db
```

Inspect `artifacts/test-report.json` and its private `.rows.json` companion. Then explicitly publish:

```sh
uv run python -m evals.publish --report artifacts/test-report.json --inspected
```

Publication writes only the sanitized report to SQLite; `/evals/summary` returns `not_run` until this step. Mock publication retains `source_mode=mock` and `evidence_status=mock_only`.

Repeated preparation commands reuse completed answer/judge checkpoints. Each successful call is saved immediately; a process crash after provider completion but before persistence can still require a repeated call. Each attempted call reserves budget before dispatch, including retries. Do not run two preparation processes against one checkpoint database. Local classifier runs checkpoint each row and preserve failed/abstained decisions as results, rather than silently retrying them.

Checkpoint identity includes inputs, frozen profile/settings, rubric/policy, mode, provider-version tag and, for classifier runs, a source-content hash. Changing a dataset or code legitimately creates new work. A held-out dataset cannot be evaluated under a changed configuration in the same classifier checkpoint ledger. Do not bypass that guard by creating another ledger for tuning against the same held-out examples; use a fresh test partition.

## UI-only provisional mock demonstration

```sh
uv run python -m scripts.coaching_artifacts mock
PROMPTPRINT_MODE=mock COACHING_MODE=suggest COACHING_PROFILE_PATH=artifacts/mock-config/profile.json COACHING_POLICY_PATH=artifacts/mock-config/policy.json uv run uvicorn backend.main:create_app --factory --host 127.0.0.1 --port 8000
```

This profile uses the intentionally fictional website labels `Mock Large` and `Mock Small`. It is not a ChatGPT model mapping. The provisional threshold exists only to exercise suggestion UI and event transitions.

Use `/docs` for interactive OpenAPI. A checked-in snapshot is `docs/coaching-openapi.json`; example request/response fixtures are under `tests/fixtures/extension-*.json`. `conversation_id`, opt-in, and target availability extend the illustrative design contract to support safe stale-result handling and explicit consent.

After obtaining a pairing code, call:

```http
POST /coaching/pair
Content-Type: application/json

{"code":"<one-time code from scripts.pair_extension>"}
```

Use the returned bearer token for `POST /classify`, `POST /coaching/events`, `DELETE /coaching/history`, and `GET /evals/summary`. A request UUID identifies a draft operation, not a user. No caller-supplied owner ID is accepted.

## Live local preparation and evaluation

Finish `chalk-setup.md` first. The following commands explicitly authorize billed calls and are not part of the mock walkthrough:

```sh
uv run --env-file .env python -m evals.prepare --allow-live --dataset artifacts/approved-tasks.jsonl --output artifacts/live-prepared.jsonl --checkpoint artifacts/live-preparation.db --provider-version-tag reviewed-pair-2026-10-17 --max-calls 40 --max-input-tokens 100000
uv run --env-file .env python -m evals.review export --dataset artifacts/live-prepared.jsonl --output artifacts/live-reviews.json --random-count 20
uv run --env-file .env python -m evals.review apply --dataset artifacts/live-prepared.jsonl --reviews artifacts/live-reviews.json --output artifacts/live-reviewed.jsonl
uv run --env-file .env python -m evals.run_local --allow-live --dataset artifacts/live-reviewed.jsonl --split dev --output artifacts/live-dev.json --checkpoint artifacts/live-classifier.db --provider-version-tag reviewed-pair-2026-10-17
uv run --env-file .env python -m evals.tune --rows artifacts/live-dev.json.rows.json --output artifacts/live-policy-frozen.json --target 0.02 --min-support 20
```

Set `COACHING_POLICY_PATH` in the environment file to the frozen artifact, then run the held-out partition once under that policy:

```sh
uv run --env-file .env python -m evals.run_local --allow-live --dataset artifacts/live-reviewed.jsonl --split test --output artifacts/live-test.json --checkpoint artifacts/live-classifier.db --provider-version-tag reviewed-pair-2026-10-17
uv run --env-file .env python -m evals.publish --report artifacts/live-test.json --inspected
```

Each live row must be `consent=synthetic` or `consent=approved`. Adapt fixture website labels to the explicitly configured profile and remove `mock_fixture_id`; merely switching the mode does not turn mock inputs/references into live evidence. Rows with mock references are rejected by live evaluation. Group related conversations and near-duplicates before splitting. Exact duplicate inputs across partitions are also rejected.

Input caps use conservative serialized UTF-8 byte reservations plus envelope overhead, not a tokenizer measurement. Reported provider usage is retained separately. Call reservations persist across resume. No price table is available: setting `EVAL_MAX_COST_USD` fails closed instead of pretending to enforce a dollar limit. Gateway/account budget limits remain necessary for a hard billing cap. Preparatory calls permit one bounded retry for transient failures, honoring `Retry-After`; waits longer than 60 seconds leave an error for later resume. Auth/schema failures do not retry. The live classifier makes one HTTP attempt.

The judge sees anonymous A/B answers, with deterministic randomized order and order swaps on a reproducible subset. It does not see model IDs, classifier decisions, probabilities, or reference labels. A swapped-order adequacy disagreement makes the reference unresolved. Invalid/truncated/refused answers never silently become resolved adequate samples. Executable verification is explicitly unavailable until an isolated checker is supplied; no generated code executes inside FastAPI.

## Chalk-native run (explicit deployment and upload)

`evals.run_chalk --help` is offline. Only `--execute` imports the deployment definitions. Decorated Functions intentionally deploy on import of `evals.chalk_functions`; do not import that module from the API or test discovery.

The image packages importable `backend` and `evals` source and copies the chosen profile/policy to fixed remote paths. Gateway credentials are injected via a Chalk secret. The task receives only `request_json`; reference columns bind only to scorers. Nine deterministic scorers expose component counts. Compute ratios from the exported counts rather than treating a generic dashboard average as product accuracy.

```sh
uv run --extra eval --env-file .env python -m evals.run_chalk --execute --dataset artifacts/live-reviewed.jsonl --split dev --output artifacts/chalk-dev.json --provider-version-tag reviewed-pair-2026-10-17 --max-calls 10 --max-input-tokens 50000
```

Scale the caps only after inspecting the tiny run. Scorers and task are separate authenticated Functions with zero configured retries. The driver records IDs before waiting. On timeout, the remote run continues; do not start a duplicate run. Reattach using the same dataset, profile, policy, mode, code and output path:

```sh
uv run --extra eval --env-file .env python -m evals.run_chalk --execute --dataset artifacts/live-reviewed.jsonl --split dev --output artifacts/chalk-dev.json --provider-version-tag reviewed-pair-2026-10-17 --resume-run <run-id>
```

Results preserve row-level task failures, scorer error counts, and missing rows even if Chalk says `SUCCEEDED`. Raw SDK row error strings are not copied into public reports. `.run.json`, `.status.json`, and `.rows.json` remain private local provenance. Run failed/incomplete reports cannot be published as completed. A remote mock run still has `source_mode=mock`; remote execution does not make synthetic outcomes real evidence.

## Metrics and uncertainty

`N` includes attempted eligible inputs. Unsupported stress inputs are reported separately under `ineligible_inputs`. `V` counts valid classifier outputs; `R` counts valid outputs with resolved references. `S_all` counts candidate suggestions and `S` their resolved subset. `H` counts inadequate-small suggestions; `A` counts adequate-small resolved rows; `M` counts those without a candidate suggestion. Failed rows with available references and unresolved labels are reported separately.

Coverage and harm metrics explicitly use **candidate actions** so shadow policies can be evaluated. `actual_suggestions` and `abstentions` describe the returned application actions. They are not observed user switches or savings. Binary agreement excludes failures, unresolved references, and explicit uncertain predictions. Every ratio carries numerator, denominator, and value; zero denominators have null values. Family slices retain their counts.

One-sided 95% exact binomial upper bounds are conditional on valid reference labels and representative independent tasks. Repeated group IDs suppress that bound. Development data never produces `interval_support` status. With zero harmful suggestions, 60 independent suggestions give about 4.87%, and 120 give about 2.47%; the small pilot cannot establish a general under-2% guarantee. Human random-sample agreement and targeted-review agreement remain separate.

## Parser interface

The ingest owner supplies stable `source_exchange_id` values, including distinct branch/regeneration IDs. Fields are `ts` (timezone-aware), `provider`, `model`, `kind`, `prompt_text`, `response_text`, and `regenerated`. Missing source fields are unknown and excluded from the corresponding field denominator. Exact text comparison and a one-second normalized timestamp tolerance are defaults. Duplicate output IDs have ambiguous field alignment and receive no field credit.

```sh
uv run python -m evals.parser_eval
uv run python -m evals.parser_eval --reference artifacts/reference.json --actual artifacts/normalized.json --output artifacts/parser-score.json
uv run python -m evals.parser_eval --reference artifacts/reference.json --runner owner_module:ingest --source artifacts/export.json --output artifacts/parser-five-runs.json
```

The first command reports `not_run`. The callback is called five times with `source`, a unique `attempt_id`, and `disable_parser_cache=True`; it returns the `IngestAttempt` schema. Cached runs are counted separately. Droid/Daytona execution and a shared ingest schema remain the ingest owner's integration work.

The exact implemented options are captured in [the CLI reference](chalk-cli-reference.md). `python -m evals.run_eval1` delegates to the local classifier runner; `python -m evals.run_eval2` delegates to parser evaluation.

## Tests and failures

```sh
uv run pytest -q
node --test tests/test_draft_coach.mjs
uv run black --check backend/coaching backend/integrations backend/reports backend/main.py evals scripts tests
uv run isort --check-only --profile black backend/coaching backend/integrations backend/reports backend/main.py evals scripts tests
uv run flake8 backend/coaching backend/integrations backend/reports backend/main.py evals scripts tests --select E9,F63,F7,F82,F401,F841
```

API: 401 for auth, 413 for body limits, 422 for contract errors, 429 for saturation, 408 for a slow request body. Gateway errors/timeouts are typed 200 abstentions. Send must proceed for all of them. SQLite is a pilot store; run one API worker so the concurrency cap is process-wide. Local `.db` files, sidecars, private experiments, answers and reviews under `artifacts/` are ignored. No request/response body logging is installed. Metadata is pruned after seven days by default, and a paired user can clear their own history.

The teammate-owned footprint module, site DOM adapters, original exchange logging, React dashboard, and Droid jobs remain intact. Their integration contracts are in `docs/coaching-integration.md`.
