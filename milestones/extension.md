# Prompt Print: Extension Milestones

Oct 16, 2026 · @Nico

## How to use this doc

Ten milestones take the extension from "prints a prompt" to the Factory demo moment. Do them in order: each one builds on the last.

**Loop for every milestone:**

1. Make sure you're on your branch: `git branch` shows `*` next to it.
2. Paste the milestone's prompt into Claude Code (in Cursor's terminal).
3. Read what it changed. Ask it to explain anything you don't follow.
4. Run the test steps yourself. Don't trust "it should work".
5. If the test passes, commit and push with the message given.
6. If it fails, paste the error or a screenshot to me with the milestone number.

**Timeline from the plan:** M1 to M3 Friday night. M4 to M7 Saturday 12 to 6 PM. M8 to M10 Saturday 6 PM to midnight. Feature freeze at midnight.

## Decide this with your team before M5

The plan has a contradiction. It says "never block the send", but the toast offers "Switch / Send anyway", which only makes sense if the prompt hasn't been sent yet. Pick one:

- **Option A, hold briefly:** catch the send, wait up to 800 ms for `/classify`, then either let it through or show the toast. If the user picks Switch, change the model and resend. Better demo, but it does pause the send for under a second.
- **Option B, advise after:** always send immediately. Show the toast afterward as advice for the next prompt ("a smaller model could have answered this"). Never blocks, but "Switch" now means "switch for next time".

M5 and M6 are written so either works. Write your choice here: \_\_\_\_

## Shared conventions

Every milestone uses these. Claude Code reads this doc's prompts, so keeping them consistent avoids rewrites.

| Thing | Value |
| --- | --- |
| Backend URL (dev) | `http://localhost:8000` |
| Site key | `chatgpt` (later `claude`, `gemini`) |
| Adapter file | `extension/adapters/chatgpt.json` |
| Who calls the backend | The service worker only, never the content script |
| Text storage | Backend counts tokens with tiktoken, stores counts, never stores prompt or response text |

Why the service worker makes all backend calls: content scripts run inside chatgpt.com's page, so their requests hit that site's CORS and security rules. The service worker has its own permissions (`host_permissions`) and avoids all of that.

**The event shape** (agree on this with whoever owns `backend/main.py`):

```json
{
  "event_id": "uuid",
  "ts": "ISO 8601",
  "site": "chatgpt",
  "model": "gpt-4o",
  "kind": "text",
  "prompt_text": "sent for token counting, not stored",
  "response_text": "sent for token counting, not stored",
  "regenerate_count": 0,
  "label": null,
  "suggestion_shown": false,
  "suggestion_taken": false
}
```

## M1. Capture the prompt

**Goal:** when you send a message on chatgpt.com, the extension prints the prompt and model name to the console. Nothing else.

**Files:** `extension/manifest.json`, `extension/src/content.ts`, `extension/adapters/chatgpt.json`, a build script, `extension/README.md`.

**Prompt for Claude Code:**

```
Read plan.pdf, especially "Pre-send coaching extension" and "Extension architecture". In extension/, build a minimal Chrome Manifest V3 extension in TypeScript for chatgpt.com.

Milestone 1 only:
- Selectors for the prompt box, send button, and model name live in extension/adapters/chatgpt.json with a "version" field. Never hard-code selectors in TypeScript; a later feature replaces this JSON at runtime.
- Content script matches https://chatgpt.com/* and https://chat.openai.com/*.
- Detect sends two ways: a keydown listener on document in the capture phase (Enter without Shift, ignoring IME composition), and a click listener on the send button using event delegation on document. ChatGPT is a single-page app that re-renders elements, so never attach listeners directly to elements that might be replaced.
- The prompt box is likely a contenteditable div, not a textarea, so read innerText, not .value. Read it before ChatGPT clears it.
- console.log the prompt text and model name with a "[PromptPrint]" prefix. Never call preventDefault or delay the send.
- esbuild build step (npm run build) that outputs extension/dist/ ready for Load unpacked.
- extension/README.md with build and load steps.

Before writing chatgpt.json, tell me what selectors you plan to use and why, since you can't see the live page. Don't add the backend, service worker logic, /classify, or the toast.
```

**Finding the real selectors** (Claude Code can't see ChatGPT, so you check):

1. Open chatgpt.com, right-click the message box, click **Inspect**.
2. Note its `id` or a stable attribute like `data-testid`. Prefer those over class names, which change often.
3. Do the same for the send button and the model name at the top.
4. Give those to Claude Code if its guesses differ.

**Test:**

1. In Cursor's terminal: `cd extension`, `npm install`, `npm run build`.
2. Chrome: `chrome://extensions`, **Developer mode** on, **Load unpacked**, pick `extension/dist`.
3. Open chatgpt.com, F12, **Console** tab. Type `PromptPrint` in the console filter box.
4. Send a message with Enter. Then send one with the send button.

**Done when:** both sends print `[PromptPrint]` with the full prompt and the correct model name, and the message still sends normally.

**If it fails:**

- Nothing prints at all: the content script isn't running. Check the extension has no red errors on `chrome://extensions` and the manifest's `matches` covers the URL you're on.
- Prints an empty prompt: it read the box after ChatGPT cleared it, or used `.value` on a div.
- Prints twice per send: both the Enter and click handlers fired. Ask Claude Code to dedupe within about 300 ms.
- Model shows `null`: the model selector is wrong. Inspect it again.
- After any code change: run `npm run build`, click the reload icon on the extension card, **then** refresh the ChatGPT tab. Skipping either step runs old code.

**Commit:** `git add .` then `git commit -m "M1: capture ChatGPT prompt and model"` then `git push`

## M2. Capture the response and regenerates

**Goal:** after ChatGPT finishes answering, print one complete exchange: prompt, model, response length, whether it was text or an image, and how many times the user regenerated.

**Why it matters:** energy scales with output length in your footprint model, and regenerations count as full extra exchanges. Without this, `footprint.py` has nothing to score.

**Prompt for Claude Code:**

```
Milestone 2 for the extension in extension/. Keep everything from M1.

- Add to adapters/chatgpt.json: a selector for assistant response messages, the regenerate button, and the stop-generating button. Bump the adapter version.
- Use a MutationObserver on the conversation container to detect when a new assistant response appears.
- Detect when the response is finished: the stop-generating button disappears, with a fallback of no DOM changes for 1.5 seconds. Don't report a response while it's still streaming.
- Build one exchange object: prompt_text, response_text, model, kind ("image" if the response contains a generated image, else "text"), regenerate_count, ts, site "chatgpt", and a uuid event_id.
- Count clicks on the regenerate button. A regenerate means the same prompt got another full response, so increment regenerate_count on the current exchange and report each regenerated response as its own exchange too.
- Keep the response observer and send detection in separate modules under extension/src/.
- console.log the finished exchange as one object with the [PromptPrint] prefix.
- Disconnect and reattach the observer when the user switches chats, since ChatGPT is a single-page app.

Don't count tokens in the extension; the backend does that with tiktoken in M3. Don't add backend calls yet.
```

**Test:**

1. Rebuild, reload the extension, refresh ChatGPT. Console filter `PromptPrint`.
2. Ask a short question. Wait for the full answer.
3. Ask for something long ("write a 500 word essay on rivers").
4. Click regenerate on that answer twice.
5. Open a different chat from the sidebar, send one more message.

**Done when:**

- One exchange object prints per answer, only after the answer finishes, never mid-stream.
- The essay's response length is clearly bigger than the short answer's.
- Regenerating twice produces two more exchanges and the count goes to 2.
- Capture still works after switching chats.

**If it fails:**

- Prints many times per answer: it's reporting during streaming. The "finished" detection is wrong.
- Nothing prints after switching chats: the observer is still attached to the old container.
- Regenerate count stays 0: the regenerate selector is wrong. ChatGPT sometimes hides it behind a hover menu, so inspect it while hovering.
- Response text includes buttons or labels: the response selector is too broad. Narrow it to the message content.

**Commit:** `M2: capture responses and regenerates`

## M3. Log to the backend

**Goal:** every finished exchange lands as a row in SQLite, with token counts and no stored text. This is the plan's Friday night goal.

**Coordinate first:** `backend/main.py` is shared. Ask your team if anyone has started it. If not, you set up the base app here and others add routes to it.

**Prompt for Claude Code (backend part):**

```
Milestone 3, backend part. In backend/main.py, set up a FastAPI app if it doesn't exist, keeping any existing routes.

- CORS: allow origins matching chrome-extension://* and http://localhost:*.
- SQLite database at backend/promptprint.db with an exchanges table: event_id (primary key, so duplicates are ignored), ts, site, model, kind, prompt_tokens, response_tokens, regenerate_count, label, suggestion_shown, suggestion_taken, received_at.
- POST /log accepts a JSON list of exchange events (shape in the extension milestones doc: event_id, ts, site, model, kind, prompt_text, response_text, regenerate_count, label, suggestion_shown, suggestion_taken). Count prompt and response tokens with tiktoken (o200k_base encoding), store the counts, and discard the text. Never write prompt_text or response_text to disk or logs.
- GET /events/recent returns the last 20 rows, for debugging.
- backend/requirements.txt with fastapi, uvicorn, tiktoken.
- Add run instructions to the top-level README.
```

**Prompt for Claude Code (extension part):**

```
Milestone 3, extension part. Keep M1 and M2.

- The content script sends each finished exchange to the service worker with chrome.runtime.sendMessage. The content script never calls the backend directly.
- The service worker (src/background.ts) puts events in an IndexedDB queue, then tries to flush: POST the queued batch to http://localhost:8000/log, and delete them from the queue only after a 200 response.
- Flush right after each new event, and also on a chrome.alarms backup timer every minute, because MV3 service workers get shut down when idle and in-memory state is lost.
- If the backend is down, keep events queued and retry on the next flush. Never drop events and never throw errors into the page.
- Manifest: add permissions storage and alarms, host_permissions for http://localhost:8000/*, and register the service worker.
- Make the backend URL a single constant so we can change it for the demo.
```

**Test:**

1. In a second terminal: `pip install -r backend/requirements.txt`, then `uvicorn backend.main:app --reload --port 8000` from the repo root.
2. Open `http://localhost:8000/docs` in Chrome. You should see the FastAPI page listing `/log`.
3. Rebuild and reload the extension, refresh ChatGPT, send two messages.
4. Open `http://localhost:8000/events/recent`.
5. Now stop the backend (Ctrl+C), send one message, start the backend again, wait about a minute, refresh `/events/recent`.

**Done when:**

- Both messages appear as rows with real token counts and the right model.
- No prompt or response text appears anywhere in the response or the database.
- The message sent while the backend was down shows up after it restarts.

**If it fails:**

- CORS error in the console: the request is coming from the content script, or CORS isn't configured. Check the service worker is the one calling.
- See service worker errors: on `chrome://extensions`, click **service worker** under your extension. It has its own console, separate from the page.
- 422 error from `/log`: the event shape doesn't match what the backend expects. Compare a logged event with the shape at the top of this doc.
- Duplicate rows: `event_id` isn't the primary key, or retries generate new IDs.

**Commit:** `M3: log exchanges to backend with token counts`. Then this is a good point to open a pull request and merge into `main`, since teammates need `/log` and the base app.

## M4. Adapters from the backend

**Goal:** the extension gets its selectors from the backend and swaps in a newer version without a reinstall or page reload. This is the plumbing Droid's Mechanic (Job 3) needs: when Droid writes a fixed adapter, this is how it reaches users.

**Rule to keep:** adapters are JSON data only, never code. Manifest V3 doesn't allow running code downloaded from a server, and selectors don't need it.

**Prompt for Claude Code (backend part):**

```
Milestone 4, backend part. Keep existing routes.

- Store adapters as files in backend/adapters/<site>.json, each with a site, an integer version, and a selectors object. Copy the current extension/adapters/chatgpt.json there as the starting version.
- GET /adapters/{site} returns the latest adapter for that site.
- GET /adapters/versions returns {site: version} for all sites, so the extension can check cheaply.
- PUT /adapters/{site} saves a new adapter only if its version is higher than the current one, and validates that the required selector keys exist. Droid's Mechanic will call this later.
```

**Prompt for Claude Code (extension part):**

```
Milestone 4, extension part. Keep M1 to M3.

- The service worker owns adapters. On install, on startup, and on a chrome.alarms timer every 5 minutes, it calls GET /adapters/versions and fetches any adapter whose version is newer than the cached one. Cache adapters in chrome.storage.local.
- The bundled extension/adapters/chatgpt.json is the fallback if the backend is unreachable and nothing is cached.
- The content script asks the service worker for its site's adapter on load instead of importing the JSON file directly.
- When the service worker gets a newer adapter, it sends it to every open tab on that site with chrome.tabs.sendMessage. The content script hot-swaps its selectors immediately with no page reload, and logs "[PromptPrint] adapter updated to vN".
- Add a message the popup or devtools can send to force a version check right now, for testing and the demo.
- Treat adapters strictly as data: no eval, no remote scripts.
```

**Test:**

1. Backend running. Rebuild, reload, refresh ChatGPT. Console should show the adapter version it loaded.
2. Edit `backend/adapters/chatgpt.json`: change nothing important but bump `version` by 1. Save.
3. Trigger the forced check (or wait 5 minutes). Do **not** refresh ChatGPT.
4. Console should show `adapter updated to v2`. Send a message; capture should still work.
5. Stop the backend, reload the extension, refresh ChatGPT. Capture should still work from the cache.

**Done when:** a version bump on the backend reaches an open ChatGPT tab without refreshing, and capture keeps working with the backend off.

**If it fails:**

- Update never arrives: check the service worker console. The alarm or the version comparison is wrong (comparing strings instead of numbers is a classic).
- Arrives but capture breaks: the content script swapped the object but its listeners still reference the old selectors. Selectors should be read fresh each time, not copied at startup.
- "Could not establish connection" error: the tab's content script isn't loaded yet. Harmless, but the service worker should catch it.

**Commit:** `M4: versioned adapters served from backend with hot swap`

## M5. /classify through Chalk

**Goal:** given a prompt and the model the user is on, the backend answers in under 800 ms: is a smaller model enough (`small_ok`), does it need the big one (`needs_big`), or would a search engine do (`use_search`)?

**Before you start:**

- Get Chalk's gateway details at the sponsor fair (Saturday 10 AM to 12 PM). The plan says confirm the API there, so don't guess it from memory.
- If you start before then, build behind a wrapper and use any small model you have a key for, then swap to Chalk. Only one file should change.
- Ask Person D for a stub `footprint.py` with a function that compares two models. Placeholder ranges are fine for now.

**Prompt for Claude Code (backend part):**

```
Milestone 5, backend part. Keep existing routes.

- backend/llm.py: one function, classify_prompt(prompt_text) -> (label, confidence). All model calls go through this file so we can switch the provider to Chalk's AI gateway by changing only this file. Read the provider, base URL, model name, and API key from environment variables. Leave a clear TODO where the Chalk gateway call goes.
- Use a short system prompt that returns strict JSON {"label": "small_ok" | "needs_big" | "use_search", "confidence": 0 to 1}. Temperature 0, small max tokens. If the output isn't valid JSON, return needs_big with confidence 0 (the safe default: never suggest downgrading when unsure).
- backend/models.json: per site, which model names count as "big" and which smaller model we'd suggest instead. Leave the actual names as TODOs for me to fill from the ChatGPT model picker.
- POST /classify takes {site, model, prompt_text}. If the current model isn't big, return label "already_small" without calling the classifier. Otherwise call classify_prompt and return {label, confidence, suggested_model, savings_pct}.
- savings_pct comes from footprint.py comparing the current and suggested model. If footprint.py isn't available yet, return savings_pct null. Never hard-code a percentage.
- Don't store prompt_text. Log only label, confidence, and latency in ms.
- Add a small script backend/try_classify.py that sends 10 sample prompts (trivial, medium, hard) and prints label and latency for each.
```

**Prompt for Claude Code (extension part):**

```
Milestone 5, extension part. Keep M1 to M4.

- The content script sends {site, model, prompt_text} to the service worker when a send is detected. The service worker calls POST /classify with an 800 ms timeout using AbortController. On timeout or error, return "skip".
- Return the result to the content script. For now just console.log label, confidence, savings_pct, and round-trip time in ms.
- Attach the label to that exchange's event so /log records it.
- Don't build the toast yet.
```

**Fill in `backend/models.json` yourself:** open ChatGPT's model picker and copy the exact names it shows. Decide which count as big and what the smaller suggestion is for each.

**Test:**

1. Run `python backend/try_classify.py`.
2. Check the labels make sense: "what's the capital of France" should be `use_search` or `small_ok`; "prove that there are infinitely many primes and explain each step" should be `needs_big`.
3. Check latency. Most calls should be well under 800 ms.
4. In ChatGPT on a big model, send a trivial prompt and a hard one. Check the console for the label and the round-trip time.

**Done when:** labels are sensible on the 10 samples, the extension prints a label for real prompts, and slow calls come back as `skip` instead of hanging.

**If it fails:**

- Everything over 800 ms: the classifier model is too big, or max tokens is too high. Use the smallest, fastest model available and cap output at around 20 tokens.
- Everything is `needs_big`: JSON parsing is failing and falling back. Print the raw model output.
- Label shows in backend but not extension: the service worker isn't passing the result back. Check its console.

**Commit:** `M5: /classify with timeout, provider wrapper for Chalk`

**Be ready to say in judging:** prompts are sent to a small classifier model to get the label, and are not stored.

## M6. The coaching toast

**Goal:** on a trivial prompt sent to a big model, a small toast appears within 1 second suggesting a cheaper option. This is the live coaching moment in your demo.

**You need the team decision from the top of this doc first.** Use the prompt that matches it.

**Prompt for Claude Code, Option A (hold briefly):**

```
Milestone 6 using Option A. Keep M1 to M5.

- Intercept the send in the capture phase: preventDefault and stopImmediatePropagation, then request /classify through the service worker (800 ms timeout from M5).
- If the label is skip, needs_big, or already_small: release the send immediately by programmatically clicking the send button, with a flag so our own interceptor ignores that click.
- If the label is small_ok or use_search: show the toast and keep the prompt in the box.
  - "Switch": try to select the suggested model using model-picker selectors added to the adapter, then send. If selecting fails, open the picker so the user can choose, and don't send.
  - "Send anyway": release the send as above.
  - If the user does nothing for 3 seconds, auto-release the send. The user must never be stuck.
- Safety valve: if anything throws anywhere in this path, release the send.
```

**Prompt for Claude Code, Option B (advise after):**

```
Milestone 6 using Option B. Keep M1 to M5.

- Never intercept. The send always goes through immediately.
- When /classify returns small_ok or use_search, show the toast as advice: "A smaller model could have answered this." with "Switch for next time" (select the suggested model using model-picker selectors added to the adapter) and "Dismiss".
- Auto-hide after 3 seconds.
```

**Add to either prompt:**

```
Toast details:
- Render inside a Shadow DOM root attached to a container we add to the page, so ChatGPT's CSS can't affect it and ours can't leak out.
- Bottom-right corner, small, dark, readable. One line of text plus two buttons.
- Text for small_ok: "A smaller model can answer this. About N% less energy." Use savings_pct from /classify. If savings_pct is null, drop the percent sentence entirely. Never hard-code a number.
- Text for use_search: "A search engine can answer this." with a "Search" button that opens a Google search for the prompt in a new tab.
- Don't show the toast more than once per exchange.
- Record suggestion_shown and suggestion_taken on that exchange's event so /log stores them.
```

**Test:**

1. Switch ChatGPT to a model you marked as big in `models.json`.
2. Send "what's 12 times 7". Toast should appear within about 1 second.
3. Click **Switch**. Check the model changes (or the picker opens).
4. Send a hard prompt (a multi-step proof). No toast should appear.
5. Send a trivial prompt and ignore the toast. Option A: the message sends by itself after 3 seconds.
6. Stop the backend and send a message. It must send normally with no toast.
7. Check `/events/recent` shows `suggestion_shown` and `suggestion_taken` correctly.

**Done when:** the trivial-prompt toast appears in under 1 second, hard prompts get no toast, and no scenario (backend off, timeout, ignored toast) ever leaves a message unsent.

**If it fails:**

- Message sends twice (Option A): the bypass flag isn't working, so your programmatic click triggers the interceptor again or ChatGPT gets two sends.
- Toast looks broken or inherits ChatGPT fonts: it's not inside Shadow DOM.
- Switch does nothing: the model-picker selectors are wrong. Inspect the picker while it's open. If it's too fragile, fall back to just opening the picker. That still demos fine.
- Toast appears late: check the round-trip time from M5. If `/classify` is slow, fix that, not the toast.

**Commit:** `M6: coaching toast`

## M7. Regenerate nudge

**Goal:** after the third regenerate on the same answer, show "Try rewording instead of regenerating." Small, but it's the most relatable waste stat in your pitch.

**Prompt for Claude Code:**

```
Milestone 7. Keep M1 to M6.

- Using the regenerate_count from M2, when it reaches 3 for one answer, show a toast through the same Shadow DOM toast component from M6: "Try rewording instead of regenerating." One "Got it" button, auto-hide after 4 seconds.
- Show it once per answer, not on every regenerate after the third.
- Optional line if footprint numbers are available from the backend: "Those regenerations used about X Wh." Get X from a backend call that uses footprint.py; if that isn't available, leave the line out. Never hard-code it.
- Record nudge_shown on the exchange event.
```

**Test:**

1. Ask any question, then click regenerate 3 times.
2. Nudge appears after the third. Click regenerate a 4th time: no second nudge.
3. Ask a new question and regenerate once: no nudge.

**Done when:** exactly one nudge per answer, on the third regenerate.

**If it fails:** the count resets or never reaches 3, which means M2's regenerate tracking is tied to the wrong message. Ask Claude Code to key the count by the original prompt's exchange.

**Commit:** `M7: regenerate nudge`

**Checkpoint:** the plan wants the core working end to end by Saturday 2 PM. If you're past that, skip ahead to M8. M8 and M9 are the Factory demo moment and the plan says never cut them.

## M8 to M10: still to write

This doc is for whoever owns the extension. Ownership: M1 to M4 and M7 to M10 go to the extension owner; M5 and M6 (/classify and the toast) go to the Chalk teammate.

Not yet written here:

- **M8. Capture health monitor:** the extension detects broken selectors and POSTs `/adapter-failure` with the site, failed selector keys, adapter version, and a page snapshot. This is the trigger for Droid's Mechanic (see the Factory doc, F5 and F6), so agree on that request shape with Nico.
- **M9. Demo break switch:** a toggle that breaks the ChatGPT selector on purpose for the Factory demo moment.
- **M10. Popup panel:** today's footprint, streak, switches taken.

Ask in chat for these to be written out in full when M1 to M7 are done.
