# General lightweight-model coach

The runtime coach answers one question: **could a lightweight text model likely
satisfy this task, or does it need a more powerful model?** It makes one Jev
prediction per eligible draft through the Chalk Model Gateway. It does not call
the target model, a benchmark comparison model, or a judge while the user types.

`config/coaching/general-coach.json` contains the shared capability description,
the Jev identity pin, provider mappings, and a provisional threshold of **0.71**.
The threshold is transferred from the existing Haiku/Sonnet development experiment
(0.69 plus a 0.02 margin). The source evaluation/run IDs are recorded in that file.
The handoff records 15 held-out suggestions, 14 graded and zero harmful among those
14. Those measurements remain about that original experiment. The generalized
capability wording changes Jev's input, and cross-provider performance has not
been calibrated. The backend labels responses `recommendation_scope=generalized`
and the extension displays **General guidance · provisional**.

No new benchmark, answer generation, judging, tuning or held-out run is needed to
use this generalization. The original profile/policy files and evaluation modules
remain available for the historical pair experiment; existing reports are not
relabelled as cross-provider results.

## Configuration

Keep the existing live gateway credentials and original profile/policy paths in
your private root `.env`. Add:

```dotenv
COACHING_GENERAL_CONFIG_PATH=config/coaching/general-coach.json
COACHING_MODE=suggest
```

The general configuration controls the runtime threshold and mappings when this
path is set. `config/coaching/policy.json` continues to describe the original pair
experiment. Clear `COACHING_GENERAL_CONFIG_PATH` to restore that pair-specific
service. `COACHING_MODE=shadow` suppresses returned suggestions in either service.
The settings loader still validates the original benchmark profile/policy.

The initial mappings are:

| Site | Current model or mode | Configured lighter option |
| --- | --- | --- |
| Claude | Any label except a recognized lightweight model | Haiku 4.5 |
| ChatGPT | Any label, including Thinking/Auto/effort labels | GPT-4o mini |
| Gemini | Any label except a recognized lightweight model | Flash |
| Perplexity | Any label except the configured lightweight target | Sonar |
| Grok | Any label except a recognized lightweight model | Grok mini |

These are product mappings, not claims of measured model equivalence, access,
relative price, parameter count, or environmental savings. The mapping file identifies
known lightweight labels to avoid redundant suggestions. There is no source-model
whitelist: unknown names and effort-only labels still reach Jev because task fit
is independent of the source label. `already_lightweight` suppresses both Chalk
switch suggestions and local fallback. DeepSeek currently
has no distinct configured lighter option; image/video sites remain outside this
text coach. The user must have enabled the site during onboarding, and a model
picker must be present before the extension requests a switch suggestion.

The browser obtains these target labels/aliases through authenticated
`GET /coaching/targets`. A suggestion selects the exact configured target in the
model menu, opening **More models** if present. It never substitutes a different
model version. If the target is missing or disabled, it leaves the menu for the
user and reports that no model was selected. A menu selection is not recorded as
a verified switch or a sent exchange.

## Extension behavior

After the user pauses typing, the extension waits up to 1.5 seconds for a Chalk
verdict, in addition to the typing debounce. The backend keeps its existing 700 ms
request budget.

- `suggest_small` with a valid target shows the advisory toast.
- `below_threshold`, `needs_big`, and `uncertain` suppress the local suggestion,
  including its after-send path and periodic check-in for that draft.
- Unsupported models, timeouts, gateway failures and unavailable backends permit
  the existing local rule as a fallback. That fallback is an unmeasured heuristic.

Sending is never blocked or delayed by awaiting advice. Edits, sends, navigation,
and model changes invalidate pending pre-send suggestions. If the user sends
before the typing debounce starts a request, the send snapshot is assessed
asynchronously for after-send advice, with Chalk first and the local rule only
after failure. A completed typing verdict is reused; a pending typing request
does not trigger a duplicate inference. Missing sessions are paired on demand;
an expired session is refreshed once after an HTTP 401, before inference.
Generalized toasts do not show
invented target-specific energy or carbon savings. The broader product's separate
local footprint estimates are unchanged.

## Running locally

From the repository root:

```sh
uv sync --extra eval --frozen
uv run --env-file .env python -m scripts.chalk_doctor
uv run python start.py
```

The doctor is offline unless an explicit network/smoke flag is supplied. Its
`runtime_coach` field describes the general coach; top-level benchmark fields
still describe the historical pair configuration. The backend uses the Chalk
Model Gateway directly. Existing deployed evaluation Functions do not need to be
redeployed for this application behavior.

Build the extension, reload Touchgrass in `chrome://extensions`, and refresh the
selected AI tab:

```sh
cd extension
npm ci
npm run build
```

Choose a recognized powerful model and type a self-contained task. Look for
`[Touchgrass] chalk verdict: suggest|decline|fallback` in the page console. Advice
has the usual cooldown; lack of a toast alone does not imply a failed request.
Using the live browser coach makes a normal billed Jev request. Software checks
can inject a classifier client into `create_app` to verify the mappings without
any network or model calls.

## Auditing the source of advice

Filter the AI page console for `coach audit`. A newly loaded content script
prints `coach engine chalk-first-v2`. If that marker is missing, reload the
extension and refresh the AI tab.

| Stage | What it records |
| --- | --- |
| `request` | Chalk was attempted; request UUID, site and model label |
| `response` | Backend action/reason, decision UUID and resolved Jev model |
| `fallback` | Why the local rule is permitted to run; not proof it showed advice |
| `offer` | The actual toast source (`chalk` or `local`) and trigger |
| `skip` | Cooldown, opt-out, a changed draft, or an already handled decision |

The offer message also explicitly says `before_send, chalk`, `after_send, chalk`,
or `..., local`. Periodic check-ins are identified as local reminders. A response
such as `already_lightweight`, `no_configured_target`, or `target_unavailable`
with no Jev identity means an application eligibility gate abstained without model
inference. `unsupported_model` can still occur in the original pair-specific
service, but is not used by the general coach. A client timeout may occur before a late backend
response; the `offer` event is the source of truth for what was actually displayed.
These console diagnostics contain no prompt, conversation context or session token.
They are not a persistent unified audit database.
