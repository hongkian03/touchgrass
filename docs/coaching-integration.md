# Extension, dashboard and teammate integration contracts

The application can now use the [general lightweight-model coach](general-coach.md)
via `COACHING_GENERAL_CONFIG_PATH`. It makes one task-fit prediction and maps it to
the current provider's configured lighter option. The original pair evaluation
and its reports remain scoped to their original model pair. Generalized API
responses include `recommendation_scope=generalized` and an evidence note.

## Extension

`extension/coaching-client.mjs` is a standalone draft-lifecycle helper, tested with Node's built-in test runner. It deliberately does not replace `content.ts`, `background.ts`, or the per-site adapter. The site owner wires:

- `classify(draft, signal)`: authenticated background fetch to the backend. Keep the pairing session in extension storage; no Chalk key belongs in the browser.
- `display(response | null)`: render/clear an advisory suggestion. Display an unmistakable mock/provisional badge. Do not invent explanations, percentages, or savings when `estimated_savings` is null.
- `emit(eventType, response)`: enqueue an event UUID tied to that response's decision and draft revision. Serialize events in order and reuse each UUID on retry. Network receipt order matters to the server state machine.
- `update(draft)`: call when draft text, selected model, conversation, visible context, capabilities or opt-in changes. Use fresh request UUIDs and increasing draft revisions; capture only the latest four complete visible messages, within 8,000 context characters. Do not scrape hidden history or attachment contents.
- `onSend()`: call synchronously alongside the original site's send handler. Never await it, intercept submission, or call `preventDefault`. It invalidates pending work and returns only an already-ready suggestion. A matching response arriving after Send is reported as `late_result` and never displayed as pre-send advice.
- `navigate()`: call when leaving the conversation/site. Invalidate and recreate the helper when the expected profile/policy changes; optional `expectedProfileVersion` and `expectedPolicyVersion` guards reject mismatches.

The helper debounces 400 ms, aborts obsolete requests, uses an 800 ms cutoff, and rejects mismatched request/revision/conversation/site/model responses and expired results. It schedules TTL removal even if the draft stays unchanged. The cutoff is an application deadline, not a claim about measured gateway latency.

Before enabling draft capture, consent copy must explain: “Coaching sends your unsent text and recent visible messages to the Prompt Print backend, Chalk, and the configured model provider. Your original conversation still runs on its provider website.” `opted_in` defaults false and `target_available` defaults false. Setting either is the extension's responsibility after consent and an actual switch check.

`tests/fixtures/extension-request.json` and `extension-response.json` are mock/shadow examples. The server never accepts an upstream URL or caller-selected billed model ID. `mock_fixture_id` is only for synthetic development and is rejected by the live classifier.

## Events and original exchange logging

Server state transitions:

```text
ready -> shown | sent_anyway | expired | late_result
shown -> dismissed | switch_clicked | sent_anyway | expired | late_result
switch_clicked -> switch_confirmed | sent_anyway | expired | late_result
switch_confirmed -> sent_with_target | sent_anyway | expired | late_result
```

Terminal states do not accept a second claimed send. Every event is authenticated, owned by the paired session, bound to a draft revision, and idempotent by `(owner,event_id)`. Reusing an event UUID with different content returns 409. Confirmed switches and target sends require the captured source/target labels to match the decision. Stale advice cannot create a new send claim. TTL-expired decisions accept only expiration/late-result telemetry.

The basic helper reports `shown`, `sent_anyway`, expiration and late arrival. The site-specific switch flow supplies click/confirmation/target-send events only after it has actually observed those transitions; it must invalidate draft advice on model changes. Do not interpret a click as a completed switch, or a switch as a sent exchange. The optional explicit `exchange_id` lets the original `/log` owner join records. This workstream does not implement `/log` or award energy savings from events.

## Dashboard

Fetch authenticated `GET /evals/summary`:

- `{"status":"not_run"}` means no inspected report was published. Render “Evaluation not run,” without fabricated zeros.
- `source_mode=mock` requires a prominent “Synthetic mock results” label.
- A completed live report names dataset, profile, policy, rubric, code revision, requested/resolved models and, when applicable, Chalk evaluation/run/revision IDs.
- Render each ratio using its value **and** numerator/denominator. Null means unavailable, never zero percent. Candidate coverage is explicitly distinct from returned `actual_suggestions`, observed user switches and achieved savings.
- Show eligible/ineligible counts, errors, unresolved references, both-fail cases, human random/targeted review counts, latency and family slices. Preserve the interval assumptions and evidence status. Do not describe development or mock numbers as a safety guarantee.
- Keep savings hidden/unavailable when null. No source-supported coefficients or output-length assumptions are currently supplied.

The sanitized Pydantic `Report` contract is `backend/reports/schemas.py`. It excludes prompt/answer/reviewer-reason content and rejects extra top-level fields. Private per-row artifacts never belong in the frontend bundle.

## Footprint and parser owners

`backend/coaching/footprint_contract.py` defines a nullable estimate interface and conservative interval subtraction. No coefficients were added to the team's placeholder `backend/footprint.py`; integrating source-supported, compatible estimates is a separate owner task. No API price-to-energy conversion is performed.

`evals/parser_eval.py` defines `Exchange`, `IngestAttempt`, stable-ID alignment and independent scoring. `sandbox_jobs/schema.json` is still a teammate-owned TODO, so the parser scoring contract is explicit rather than silently inventing source metadata. The callback must provide five independent attempt IDs, parser hashes, cache status, repair counts and normalized records. An ingest job's self-written tests are not reference truth. No Droid or Daytona jobs run as part of these tests.
