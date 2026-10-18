# Handoff: Chalk-powered coach (Touchgrass / PromptPrint)

Context for a coding agent picking up this work. Last updated 2026-10-18. Read this whole file before touching code; several things here are not obvious from the repo.

## 1. What the project is

- **Touchgrass** is a Chrome extension (WXT + React, `extension/`) that tracks AI chat usage and **coaches** the user: while they type a prompt on a big model, it may show a **toast** (small pop-up card) suggesting a smaller model. Buttons: *Switch here*, *Open in other AI*, *Send anyway*, *Not now*. It never blocks a send.
- **PromptPrint backend** (FastAPI, `backend/`) serves the extension. Its coaching part (`backend/coaching/`) classifies drafts with **Jev** (TypeSafe "System One" model, via the **Chalk Model Gateway**) and applies a tuned confidence **policy**.
- **Eval pipeline** (`evals/`) measures Jev against judged answers and tunes the policy threshold; it can run locally or as a **Chalk Evaluation** (Chalk Functions + scorers).

## 2. Current goal and where we are

Goal: replace the extension's unmeasured local coaching rule with the **Chalk/Jev-backed coach**, keeping the local rule as a **fallback** ("option C: Chalk-first, local fallback").

Status:

| Step | State |
|---|---|
| 1. Synthetic dataset (151 prompts) | done, committed |
| 2. Generate Haiku/Sonnet answers + judge | done (judge v2, materiality-aware) |
| 3. Human review | skipped by user decision; judge grades are the reference |
| 4. Jev on dev + tune | done; threshold **0.71** chosen (tuned 0.69 + safety margin) |
| 5. One-shot held-out test on Chalk | done, **SUCCEEDED**, published to local DB |
| 6. Turn on real suggestions | **implemented, NOT committed, NOT yet tested in a real browser** |

## 3. Git state

- Branch: `frontend-extension` (main branch is `main`). Remote: `origin` = github.com/nicovillab/HackHarvard.
- **Restore point: `bbf26b4`** (pushed). Known-good state before step 6: extension tests 177/177, backend 106/106, backend coaching in shadow mode. If step 6 breaks things: `git reset --hard bbf26b4` (confirm with the user first; it discards later work).
- `173c55e`: synthetic eval set, judge v2, `/space/insight` route restored, numpy/pillow deps, `config/coaching/profile.json` + `policy.json`.
- **Uncommitted (step 6 work):**
  - `extension/lib/coachArbiter.ts` (new), `extension/tests/coachArbiter.test.ts` (new)
  - `extension/lib/startCoachWatch.ts`, `extension/lib/coachChoice.ts`, `extension/lib/draftCoach.ts`, `extension/tests/coachChoice.test.ts`
  - `config/coaching/claude-profile.json`, `config/coaching/claude-policy.json` (new)
  - `.env` (gitignored) switched to live/suggest; original saved at `artifacts/env-backup-pre-step6`
- `uiux inspo/` is the user's design-reference folder: intentionally **not** committed.
- `artifacts/` is gitignored: every eval result, checkpoint DB and the frozen policy live only on the user's machine.

## 4. User preferences (follow these)

- **Never add Claude/AI attribution** (no `Co-Authored-By` trailers, no "Generated with" lines) to commits or PRs.
- Commit/push only when asked. Only stage files you changed; the user often has unrelated in-progress work.
- Ask before billed actions beyond what was agreed; report call counts.
- The user likes short recaps and explicit flags for anything they must do by hand.

## 5. Environment quirks (Windows machine)

- **Python**: no `uv`/`python` on PATH. Use the project venv: `.venv\Scripts\python` (created with `uv`; `uv` lives at `.venv\Scripts\uv`). System Python lacks deps, so `py start.py` fails; use `.venv\Scripts\python start.py`.
- **Node**: not on PATH in agent shells. Prefix `export PATH="/c/Program Files/nodejs:$PATH"` (Git Bash) before `npm`/`npx`.
- **UTF-8 bug**: `evals/data.py` reads/writes files with the Windows default encoding (cp1252) and crashes on characters like `−`. Workaround used everywhere: run with `PYTHONUTF8=1`. Proper fix (not done): pass `encoding="utf-8"` in `load_dataset`, `write_dataset`, `write_json` and other `read_text`/`write_text` calls in `evals/`.
- **`.env` loading**: eval scripts call `Settings.from_env()` but don't load `.env` themselves. Pattern used:
  ```bash
  PYTHONUTF8=1 PROMPTPRINT_MODE=live .venv/Scripts/python -c "
  from dotenv import load_dotenv; load_dotenv('.env')
  import runpy,sys; sys.argv=['tune','--rows','...']
  runpy.run_module('evals.tune',run_name='__main__')"
  ```
  `load_dotenv` does not override variables already set, so inline `VAR=...` overrides work.
- **`chalkcompute` has no Windows wheel** (its sdist needs Chalk's private repo). All Chalk SDK work runs in **WSL Ubuntu**:
  - venv: `/root/hh-venv` (Python 3.12, `uv sync --extra eval --frozen` with `UV_PROJECT_ENVIRONMENT=/root/hh-venv`)
  - `chalk` CLI v1.55.1 at `/root/.chalk/bin/chalk`; logged in (`chalk login --no-prompt`) to env `prmp7e69504c` (Default/production)
  - The CLI login belongs to **a teammate's Chalk account**, not the user's; deployments show under that account.
  - Quoting `$vars` through `wsl -d Ubuntu -- bash -lc '...'` from Git Bash is unreliable; write a script to `artifacts/wsl/*.sh` and run `wsl -d Ubuntu -- bash -lc 'bash /mnt/c/Users/nicol/Downloads/HackHarvard/artifacts/wsl/x.sh'`.
- `.env` contains secrets (Chalk router key, Groq, Daytona, etc.). Never print values; compare by hash if needed. `.env` has three duplicated lines (`CHALK_ROUTER_BASE_URL`, `CHALK_ENV_ID`, `CHALK_ROUTER_API_KEY`), harmless.

## 6. Coaching configuration

### Models
- Jev: `jev-latest` (resolves to `jev-1.13.0`, pinned as `expected_jev_resolved_model`). **Do not use `typesafe/jev-latest`**: that is the chat-completions catalog name; Jev is called on `/v1/systemone`, which rejects the prefix ("Unknown model").
- Small: `anthropic/claude-haiku-4-5-20251001`. Large: `anthropic/claude-sonnet-5-5`. Judge: `openai/gpt-6.1-sol`.

### Files
| File | Purpose |
|---|---|
| `config/coaching/profile.json` | Evaluated offline profile (`site: offline-benchmark`, fingerprint `1f3cd55d…`). All eval evidence is tied to this. |
| `config/coaching/policy.json` | Original shadow policy for that profile (threshold 1.0). |
| `artifacts/live-policy-frozen-v2.json` | **Frozen test policy**: `tuned-eac2ae323e4e-margin071`, provisional, threshold 0.71, fingerprint `1f3cd55d…`. |
| `config/coaching/claude-profile.json` | **Website profile** (uncommitted): `site: claude`, aliases `Sonnet 5.5` + `Sonnet 5.5 {Low,Medium,High,Extra,Max}`, target `Haiku 4.5`, `switch_supported` and `website_equivalence_verified` true. `small_capabilities` text is **byte-identical** to the evaluated profile. Fingerprint `b535ef8f…`. |
| `config/coaching/claude-policy.json` | Frozen 0.71 policy re-pointed at `b535ef8f…` (`…-margin071-claude-web`). |

Why re-pointing is legitimate: Jev's input is only `prompt_text`, `recent_messages`, `context_available`, `small_capabilities` (`backend/coaching/rubric.py:state_for`). Site and model labels never reach Jev, so Jev behaves identically under the website profile. This is recorded as a mapping change, not new evidence.

### Current `.env` (relevant lines)
```
PROMPTPRINT_MODE=live
COACHING_MODE=suggest
COACHING_PROFILE_PATH=config/coaching/claude-profile.json
COACHING_POLICY_PATH=config/coaching/claude-policy.json
CLASSIFY_DEADLINE_MS=700
```
Rollback to shadow: copy `artifacts/env-backup-pre-step6` over `.env`.

### Gates for a real suggestion (`backend/coaching/service.py` `skip_reason`, `backend/coaching/policy.py` `choose`)
Site must equal profile `site`; label must be in `website_aliases`; `switch_supported` and request `target_available`; `COACHING_MODE=suggest` and policy not shadow; live mode needs policy `source_mode: live`, a pinned Jev version and `website_equivalence_verified`; Jev `small_ok` ≥ threshold.

## 7. Eval history and results

Dataset: `evals/datasets/synthetic-v1.jsonl`, 151 hand-written synthetic prompts, 13 families, 80 simple / 45 medium / 26 hard, 108 dev / 43 test (`consent: synthetic`). Includes deliberately vague follow-ups ("Fix the bug above.").

1. **Prepare v1** (judge `absolute-adequacy-v1`): 500 calls. Judge was strict; it failed Haiku for minor side-fact slips. Tuning at 2% target → shadow; best was 0.73 with 1/26 bad.
2. **Judge v2** (`material-adequacy-v2`, `evals/prepare.py`): fails an answer only for material errors; grades each answer on its own. Answers now cached under a key **excluding judge settings** (`answer_key`), so a judge change reuses paid answers. Seeded `artifacts/live-preparation-v2.db` with the 300 v1 answers; re-judge cost 201 calls. 8 grades flipped inadequate → adequate, none the other way.
3. **Jev on dev v2** (108 calls): at 2% target, tuned threshold **0.69** (46 suggestions, 0 bad). Jev scores vary run to run (median 0.02, max 0.07); two bad cases sat at 0.68–0.70, so **0.71** was chosen for margin (34 dev suggestions).
4. **Held-out test on Chalk** (frozen 0.71): Chalk run `71dd8177-6064-4075-b1e2-07df8e8f5ce7`, evaluation `prompt-print-tuned-eac2ae323e4e-margin071` (`cmvdfrfng0g5l013ewdsx1tcc`) in suite Default.
   - 43/43 valid, 0 task/scorer errors; **15 suggestions, 0 harmful of 14 graded**; coverage 35%; missed opportunities 24/38; agreement 36/36; 95% upper bound 19.3%; evidence status `empirical_only` (needs hundreds of suggestions for `interval_support`).
   - Report `artifacts/chalk-test-v2.json` (+ `.rows.json`, `.run.json`). **Published** via `evals.publish --inspected` into `artifacts/coaching.db`; `/evals/summary` returns it.
   - Smoke run (10 dev rows): run `b49a6a69-6f4c-4f8b-ad3d-f18266a44cdd`, `artifacts/chalk-smoke-dev10.json`.
   - The held-out guard makes the test split **one-shot** under a frozen config. Do not rerun the test split with a different policy; use a fresh test partition.

Approximate billed calls so far: ~935 gateway calls + 4 step-6 checks.

### Chalk platform issue: scale-from-zero doesn't trigger
In this environment, queued Function calls sit `PENDING` while the scaling groups stay `ScaledToZero` (classifier and all 9 scorers). Workaround: one junk **synchronous** call wakes a function without billing Jev:
```bash
chalk function call -n prompt-print-classifier --in 'request_json=@file(empty.json)'          # {} fails validation before Jev
chalk function call -n prompt-print-valid --in 'output=@file(empty.json)' --in small_adequate=true
```
`artifacts/wsl/test_run.sh` runs `evals.run_chalk` with a background waker loop that does this automatically. Check queues with `chalk function calls recent --name <fn>`. Report this to Chalk staff.

## 8. Extension coaching architecture

- **Local rule** (`extension/lib/classify.ts`, `shouldOfferChoice` in `coachChoice.ts`): prompt ≤200 chars, no "heavy" words (write, code, design, analyze…), no code characters, user on the site's `defaultModel`. Free, instant, every site, unmeasured. **Groq is not the local coach**; Groq is only used for AI-site detection (`groqClassify.ts`) and "open other" routing (`groqRoute.ts`).
- **Chalk coach** (`DraftCoach` in `draftCoach.ts`, wired in `startCoachWatch.ts`): sends the draft (prompt + last messages + scraped model label) to the backend `/classify` via the background script (`bgBackend("classify")`). `DraftCoach` only displays `suggest_small` responses that arrive within `holdMs` (800 ms).
- **Pairing** is automatic: on startup the background calls `POST /coaching/auto-pair` on `http://127.0.0.1:8000` and stores `coachingSessionToken`.
- Claude.ai model label is read from `[data-testid^='model-selector']` and looks like **`"Sonnet 5.5 Medium"`** (model + effort). Menu: Fable 5.1, Opus 5.5, Sonnet 5.5, **Haiku 5.5**, Effort (Low/Medium/High/Extra/Max), and **More models** (Fable 5, Opus 5/4.8/4.7/4.6/3, Sonnet 5/4.6, **Haiku 4.5**).

### Step 6 implementation (uncommitted)
- `coachArbiter.ts`: `chalkVerdict(response)` maps a backend answer to
  - `suggest`: `action == suggest_small` with a target and ttl > 0
  - `decline`: `reason_code` in `{threshold_met, below_threshold, needs_big, uncertain}` (Chalk measured and said no)
  - `fallback`: everything else (shadow_policy, unsupported_model, target_unavailable, timeout, gateway errors, null/error, suggest without target)
  - `VerdictBoard` passes each draft's verdict from the classify hook to `maybeCoach`; waits at most `CHALK_VERDICT_WAIT_MS` = 1500 ms, then falls back.
- `startCoachWatch.ts` `maybeCoach`: when paired + enabled, sends the draft, awaits the verdict, ignores it if the draft changed, then: decline → no toast (and records `lastChalkDeclined` so the **after-send** local toast can't overrule it); suggest → DraftCoach shows it, or the arbiter shows it if DraftCoach dropped it as late (`lastChalkDisplayed` dedupes); fallback → local rule as before. Logs `[Touchgrass] chalk verdict: …`.
- `switchModelHere(button, root, waitMs, preferLabel)`: with a Chalk target (`target.website_label` = "Haiku 4.5") it picks only that model, opening **More models** if needed, and never substitutes Haiku 5.5; returns `menu_open` otherwise.
- `CoachClassifyResponse` type now has `reason_code` and `target: {model_id, website_label}` (matches backend `Target`).
- Check-ins (every 5th big-model prompt) stay local-only.

### Verification done
- Extension: 186/186 vitest pass (5 new), `wxt build` OK, no new `tsc` errors (35 pre-existing errors in `Pip.tsx`, `background.ts`, etc. were already there).
- Backend: 106/106 pytest pass with the live `.env`.
- Live gate check via `artifacts/step6_check.py` (run with `PYTHONPATH=.`):
  - claude / Sonnet 5.5 Medium / "How do I make text bold in HTML?" → `suggest_small`, `threshold_met`, 0.85, target Haiku 4.5, 469 ms
  - claude / Sonnet / "capital of Australia?" → `below_threshold` (0.66) → decline
  - claude / Sonnet / 12-coin puzzle → `uncertain` → decline
  - claude / Opus 5.5 Medium and chatgpt / GPT-5 → `unsupported_model`, no Jev call → fallback

### Not yet verified
- **Real-browser test** (needs the user): start backend `.venv\Scripts\python start.py`, reload the extension at `chrome://extensions` (build: `extension/.output/chrome-mv3`), on Claude.ai pick Sonnet 5.5, type "How do I make text bold in HTML?", expect a toast within ~1 s whose switch goes to Haiku 4.5; a hard prompt should show nothing; Opus should use the local rule. Watch the console for `chalk verdict`.
- `start.py` defaults to Daytona mode when `DAYTONA_API_KEY` is set; it is unconfirmed whether that affects coaching routes.

## 9. Key decisions and caveats

- **Evidence is about the target model (Haiku 4.5).** The judge graded Haiku's answer against the task itself; Sonnet's answer only gave the judge something to compare against. Therefore:
  - Any **bigger Claude model → Haiku 4.5** is equally supported (the source side was over-restricted to Sonnet 5.5; widening aliases is the agreed next step, pending user go-ahead).
  - Any **other target** (Haiku 5.5, GPT-5 mini, Gemini Flash) is unmeasured; Jev's capabilities text still describes Haiku 4.5.
- Website "Sonnet 5.5 Medium" includes reasoning effort the API eval didn't use; `website_equivalence_verified: true` is a reasonable claim, not a measurement.
- 0/14 on test is `empirical_only`, not proof of <2% harm. Present it as "zero harmful suggestions on held-out synthetic prompts, threshold chosen on separate dev data".
- The local rule and Chalk disagree in useful ways (e.g. "Write a haiku…" local=no, short-but-hard "Prove √2 irrational" local=yes); that's the demo story for why Chalk-first matters.
- The extension dashboard eval panel only shows "Report status: ready" after publishing; it doesn't render numbers yet (small UI change if wanted).

## 10. Next steps (in suggested order)

1. User runs the real-browser test (section 8). Fix anything found.
2. Commit + push step 6 (only the files listed in section 3; no attribution lines).
3. **Widen Claude source models** in `claude-profile.json` `website_aliases`: Fable 5.1, Fable 5, Opus 5.5/5/4.8/4.7/4.6/3, Sonnet 5.5/5/4.6, each with and without effort suffixes. Recompute the fingerprint and re-point `claude-policy.json` (same method as before: copy the frozen policy, set `profile_fingerprint`, keep threshold 0.71). Config only, no new eval.
4. Optional: fix the `evals/` UTF-8 encoding properly; render eval numbers in the dashboard.
5. Roadmap: **per-site profiles** in the backend (load one profile/policy per `site`; currently a single profile), then evaluate new targets with the same pipeline (~450 billed calls each): new profile with that model's `small_capabilities`, `evals.prepare --allow-live`, `evals.run_local --split dev`, `evals.tune`, then the one-shot `evals.run_chalk --execute --split test` on a fresh test partition.

## 11. Command reference

```bash
# backend tests / server
.venv/Scripts/python -m pytest -q tests
.venv/Scripts/python start.py

# extension tests / build (Git Bash)
export PATH="/c/Program Files/nodejs:$PATH"; cd extension; npx vitest run; npx wxt build

# offline config check, then live catalog + one Jev smoke call
PROMPTPRINT_MODE=live .venv/Scripts/python -c "from dotenv import load_dotenv; load_dotenv('.env'); import runpy,sys; sys.argv=['d','--network','--smoke','jev']; runpy.run_module('scripts.chalk_doctor',run_name='__main__')"

# profile fingerprint
.venv/Scripts/python -m scripts.coaching_artifacts fingerprint --profile config/coaching/claude-profile.json

# tune from cached dev rows (free)
PYTHONUTF8=1 PROMPTPRINT_MODE=live .venv/Scripts/python -c "from dotenv import load_dotenv; load_dotenv('.env'); import runpy,sys; sys.argv=['t','--rows','artifacts/live-dev-v2.json.rows.json','--output','artifacts/explore/x.json','--target','0.02','--min-support','20']; runpy.run_module('evals.tune',run_name='__main__')"

# Chalk (inside WSL)
chalk eval run get <run-id>
chalk scaling-group list
chalk function calls recent --name prompt-print-classifier
```

Docs: `docs/chalk-runbook.md`, `docs/chalk-setup.md`, `docs/coaching-integration.md`, and `AGENTS.md` (Chalk SDK rules).
