# Chalk setup (manual, after local development)

The repository now contains a runnable coaching backend and an offline experiment pipeline. Defaults are `PROMPTPRINT_MODE=mock` and `COACHING_MODE=shadow`. Mock outputs are synthetic wiring checks, not measurements of Jev or any answer model.

## Local environment

Use Python 3.11–3.14 and uv. The checked lockfile pins dependencies. The API does not need the Chalk SDK:

```sh
uv sync
uv run python -m scripts.chalk_doctor
uv run uvicorn backend.main:create_app --factory --host 127.0.0.1 --port 8000
```

The evaluation extra installs the inspected Chalk SDK versions:

```sh
uv sync --extra eval
```

Configuration reads process environment variables. A `.env` file is **not** loaded implicitly; use `uv run --env-file .env ...` when desired. Copy `.env.example`, keeping gateway secrets exclusively on the backend. The old `CHALK_API_KEY` placeholder belongs to the original scaffold; this integration uses `CHALK_ROUTER_API_KEY` for inference and separate Chalk SDK authentication for deployments/evaluations.

The backend has no existing login integration. This implementation provides local, one-time pairing. It must stay bound to loopback for the demo. Shared hosting needs the application's real user authentication before exposure. `APP_SESSION_SECRET` is a private random key for input HMACs; if unset, a fresh process-local key is generated. Session bearer tokens and pairing codes are stored only as hashes. Pairing codes expire in five minutes and are consumed once; sessions expire with the configured retention period.

Run this on the backend machine to issue a pairing code:

```sh
uv run python -m scripts.pair_extension
```

The extension submits that code to `POST /coaching/pair`, then stores the returned session token in extension storage. Browser requests use `Authorization: Bearer <session_token>`. Use exact extension/web origins in `ALLOWED_ORIGINS`; origins are not authentication. There is no browser-visible gateway key or shared static development bearer token.

## Later account configuration

1. Select the intended Chalk environment, confirm funding, and set provider/key budgets.
2. Configure a TypeSafe connection supporting native System One. Configure separate small/large answer models and an independent generative judge. Do not infer model access from family names, registration, or sponsor logos.
3. Obtain actual gateway catalog IDs. Pin provider versions where supported. If aliases are unavoidable, record a deliberate provider-version tag for each frozen experiment and the resolved response IDs. Changing the alias target requires a new experiment tag; a local cache cannot discover silent upstream alias changes.
4. Create a scoped gateway key. Configure the gateway route to avoid provider fallbacks/retries if strict single-attempt billing is required; this HTTP adapter itself never retries on the live path.
5. Copy `backend/coaching/assets/live-profile.template.json` to an ignored local path. Fill the exact model IDs, website aliases, target label, reviewed capability description, and model-appropriate generation settings. Enable `switch_supported` only for a switch the site adapter can actually offer. `website_equivalence_verified` stays false until API/site equivalence is established. Unknown equivalence prevents live UI suggestions, while candidate evaluation remains possible.
6. Set `JEV_MODEL_ID` to the same ID as the profile. Optional `SMALL_MODEL_ID`/`LARGE_MODEL_ID`, when supplied, must match the profile. Set the independent `JUDGE_MODEL_ID` for preparation. Update the profile version after any capability/mapping/settings change. After the Jev smoke call, record its resolved ID in `expected_jev_resolved_model`; live suggestions require this identity, and a changed resolved model abstains. Regenerate the fingerprint and reevaluate when changing it. Generation settings support `token_limit_parameter=max_tokens|max_completion_tokens`, nullable `temperature` (null omits it), and an optional seed; select settings supported by each configured model.
7. Inspect the profile fingerprint and copy it to the live shadow policy:

   ```sh
   uv run python -m scripts.coaching_artifacts fingerprint --profile artifacts/live-profile.json
   ```

   Use `backend/coaching/assets/live-policy.template.json` as the starting policy. Keep `status=shadow`, `source_mode=live`, and `COACHING_MODE=shadow`. Set `COACHING_PROFILE_PATH` and `COACHING_POLICY_PATH` to these local files.
8. Set `PROMPTPRINT_MODE=live`, `CHALK_ENV_ID`, and `CHALK_ROUTER_API_KEY`. Run the offline doctor first. It checks configuration without inference. Then deliberately request catalog access and individual billed smoke calls:

   ```sh
   uv run --env-file .env python -m scripts.chalk_doctor
   uv run --env-file .env python -m scripts.chalk_doctor --network
   uv run --env-file .env python -m scripts.chalk_doctor --smoke jev
   uv run --env-file .env python -m scripts.chalk_doctor --smoke small
   uv run --env-file .env python -m scripts.chalk_doctor --smoke large
   uv run --env-file .env python -m scripts.chalk_doctor --smoke judge
   ```

9. For remote evaluation, authenticate using `chalk login` and select the correct team/environment using your installed CLI. Confirm Evaluations, dataset storage and the authenticated Function queue are enabled. Account onboarding prerequisites must be confirmed in that environment; this code does not create a feature deployment or provision a sandbox.
10. Store a Chalk environment secret named `CHALK_ROUTER_API_KEY` using the dashboard or supported CLI secret command. The deployed task uses `Secret.from_chalk_env`; a gateway key alone does not authenticate the deployment SDK. No secrets are copied into the source, image environment literals, or dataset.
11. Follow the runbook for development tuning, a frozen held-out run, report inspection, and explicit publication. A tuned policy is only provisional. An approved policy additionally requires live evidence and an `evidence_revision`. Switching `COACHING_MODE=suggest` is an explicit rollout choice, not a consequence of dashboard setup.

## API contracts verified during implementation

The native gateway route is `{CHALK_ROUTER_BASE_URL}/v1/systemone`, with `Authorization` and `X-Chalk-Env-Id`. Generative calls use the distinct `/chat/completions` path. These paths are documented by [Chalk Model Gateway](https://docs.chalk.ai/docs/model-gateway).

Choice responses are parsed from `answers.model_fit`, with `type`, `choice`, `probabilities`, and `confidence`; the resolved model is the top-level `model`. See the [TypeSafe API reference](https://docs.typesafe.ai/api). Confidence is vendor metadata, not measured application correctness.

`chalkcompute==2.13.7` was inspected locally for `function`, `Image.add_local_python_source`, `Image.add_local_file`, `Secret.from_chalk_env`, `DatasetClient.upload/read`, `Evaluation.create/run`, and `EvaluationRun.wait`. The integration follows the [Chalk Evaluations quick start](https://docs.chalk.ai/docs/evaluations/quick-start). Local SDK shape checks and fake-SDK tests do not prove account access or remote execution.
