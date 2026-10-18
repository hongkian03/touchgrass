# Touchgrass extension — test results

**Run date:** 2026-10-17  
**Command:** `npx vitest run` + `npx playwright test e2e/groq-hop.spec.ts e2e/coach-redirect.spec.ts`  
**Summary:** **144 passed** (134 unit + 10 e2e). **0 failed.**

---

## Overall

| Suite | Files | Tests | Result | Duration |
| --- | ---: | ---: | --- | ---: |
| Vitest (unit) | 15 | 134 | PASS | ~0.7s |
| Playwright (e2e) | 2 | 10 | PASS | ~26s |
| **Total** | **17** | **144** | **PASS** | — |

---

## Plan coverage (Musky + non-weather hop + dead context)

| Check | Outcome |
| --- | --- |
| Onboarding says “Hi! I'm Musky” / “Meet Musky…” | PASS (`onboarding Musky greeting copy`) |
| `classify` weather / define / translate / who-is → `small_ok` | PASS |
| `classify` long coding ask → `needs_big` | PASS |
| Groq stay on Claude for `define photosynthesis` still hops | PASS |
| Groq stay on Claude for hard coding ask does **not** hop | PASS |
| Hop logic not hardcoded to `"whats todays weather?"` | PASS |
| `planCoachAuto` define / who-is redirects without model label | PASS |
| Playwright: `define photosynthesis` → Gemini toast | PASS |
| Dead-context helpers (`isExtensionContextError`, storage alive) | PASS |

---

## Vitest unit tests (134)

### `tests/tokens.test.ts` (10) — PASS

| Test | Outcome |
| --- | --- |
| declares each palette hex as a `:root` variable | PASS |
| does not set yale-blue to a wrong hex | PASS |
| registers Castoro + Geist via local `@font-face`, not google fonts | PASS |
| points at muskie sticker + spritesheet, no off-palette SVG hex | PASS |
| uses white surface for extension chrome | PASS |
| shows Ahead-style Pip sticker above Puddle title | PASS |
| inline popup onboarding mirrors name + platform chrome | PASS |
| popup title is Touchgrass, not Prompt Print | PASS |
| manifest name in wxt.config is Touchgrass | PASS |
| built manifest: Groq active; AI sites optional until onboarding | PASS |

### `tests/groqRoute.test.ts` (16) — PASS

| Test | Outcome |
| --- | --- |
| accepts enabled platformId | PASS |
| prefers non-DeepSeek when alternatives exist | PASS |
| falls back to current when id not in enabled list | PASS |
| fails on empty enabled | PASS |
| strips markdown fences around JSON | PASS |
| weather draft forces hop off claude when gemini enabled | PASS |
| define ask forces hop off claude when gemini enabled | PASS |
| translate ask forces hop to perplexity when enabled | PASS |
| who-is ask forces hop off chatgpt | PASS |
| hard coding ask does not force hop when Groq says stay | PASS |
| hop logic is not hardcoded to one weather string | PASS |
| simpleHopFallbackId prefers perplexity then gemini | PASS |
| returns missing_key without env | PASS |
| parses successful Groq response | PASS |
| simple-ask HTTP failure falls back to gemini when enabled | PASS |
| hard-ask HTTP failure does not invent a hop | PASS |

### `tests/savings.test.ts` (4) — PASS

| Test | Outcome |
| --- | --- |
| mini vs gpt-5: 2.1 Wh, 0.035 L, 0.96 g | PASS |
| already on default model saves nothing | PASS |
| 0.5 g → 1 sapling (labeled demo rate) | PASS |
| cartoons use real energy/water/tree/CO2 colors | PASS |

### `tests/score.test.ts` (17) — PASS

| Test | Outcome |
| --- | --- |
| classify("what's the weather in Boston") → small_ok | PASS |
| classify define / translate / who-is → small_ok | PASS |
| classify long coding ask → needs_big | PASS |
| C1 two oversized simple prompts → score 70 | PASS |
| C2 regen + image → score 70 | PASS |
| C3 one video → score 60 | PASS |
| C4 empty day → score 100 | PASS |
| C6 holdouts ≥ 8 without small-hint regex | PASS |
| C6 recomputed accuracy ≥ 0.7 | PASS |
| C7 small_ok + frontier does not open DeepSeek | PASS |
| C7 empty enabled does not invent Mistral/DeepSeek | PASS |
| C7 ChatGPT on small + gemini → open gemini | PASS |
| C7 Claude on haiku + perplexity → open perplexity | PASS |
| C7 only chatgpt on small → no DeepSeek / no Mistral | PASS |
| C7 deepseek-only alternate skipped | PASS |
| weekWindow returns 7 local date keys | PASS |
| month window is 30 days ending today | PASS |

### `tests/pip.test.ts` (10) — PASS

| Test | Outcome |
| --- | --- |
| every PipSvg fill/stroke hex is palette-only | PASS |
| lists each of the five allowed hexes | PASS |
| bubble max is 240 | PASS |
| overlay is top-right toast with chip, no pet, no Yes/No | PASS |
| content watches typing and holds Send when paired | PASS |
| hides after lastCoachAt cooldown | PASS |
| coachBottomPx with null stays default | PASS |
| weather draft on chatgpt switches model, not DeepSeek | PASS |
| fixture has composer + model-label and auto coach | PASS |
| dashboard exposes Try Pip | PASS |

### `tests/coachTarget.test.ts` (15) — PASS

| Test | Outcome |
| --- | --- |
| names Gemini with brand icon | PASS |
| names Mistral with favicon | PASS |
| maps claude.ai and chatgpt.com | PASS |
| switches on-page when modelLabel is present | PASS |
| ChatGPT no label + gemini → redirect gemini | PASS |
| Claude no label + perplexity → redirect perplexity | PASS |
| only chatgpt enabled and no label → noop | PASS |
| never redirects to DeepSeek even if only alternate | PASS |
| define ask + no label redirects to gemini (not weather-only) | PASS |
| who-is ask + perplexity enabled redirects | PASS |
| hard coding ask with no label still redirects only via alternate pick | PASS |
| formatHandoffDraft returns raw draft when no prior turns | PASS |
| formatHandoffDraft prepends compact context when prior turns exist | PASS |
| scrapeRecentMessages extracts turns within budget | PASS |
| applyCoachSwitch updates label and clicks matching option | PASS |

### `tests/coachInject.test.ts` (11) — PASS

| Test | Outcome |
| --- | --- |
| includes all major chat hosts | PASS |
| enabled subset maps to those hosts only | PASS |
| prefers ProseMirror and chat-input selectors first | PASS |
| content matches all platforms and starts coach watch | PASS |
| startCoachWatch uses document capture + Groq route | PASS |
| startCoachWatch intercepts Enter and logs watching | PASS |
| background rebinds on permission and message | PASS |
| coach-open-paste pastes then sends Enter | PASS |
| BrandIcon resolves gemini via runtime.getURL | PASS |
| onboarding sends coach-rebind after finish | PASS |
| inline popup onboarding also rebinds coach | PASS |

### `tests/dashboard.test.ts` (7) — PASS

| Test | Outcome |
| --- | --- |
| column width is 720–880 | PASS |
| shows up to three insight cards | PASS |
| hand: 30/30 = 1.0 and matches recomputeAccuracy | PASS |
| Hey Pip weekly report → recap | PASS |
| weather path host is not DeepSeek | PASS |
| weather with gemini enabled can open gemini when already on small | PASS |
| manifest suggests Alt+Shift+P | PASS |

### `tests/onboarding.test.ts` (22) — PASS

| Test | Outcome |
| --- | --- |
| continue disabled when selected-count is 0 | PASS |
| continue enabled when selected-count is 1 | PASS |
| continue enabled when selected-count is many | PASS |
| returns only hosts for picked platforms | PASS |
| unions hosts when multiple platforms selected | PASS |
| includes custom site hosts | PASS |
| normalizes bare domain to https pattern | PASS |
| rejects junk input | PASS |
| maps known host to platform id | PASS |
| maps aliases and deep paths to the right logo platform | PASS |
| allows curated AI sites as custom tiles | PASS |
| rejects non-AI sites like YouTube and news | PASS |
| random URLs resolve to expected brand or custom AI host | PASS |
| custom hosts append as icon cells | PASS |
| DEFAULT_STATE includes empty userName | PASS |
| estimateStorageBytes returns positive size for seeded state | PASS |
| detects extension context invalidated errors | PASS |
| says Hi I'm Musky not Pip | PASS |
| ranks scores and slugifies names | PASS |
| symmetrically centers tree positions around 540 | PASS |
| builds SVG card with name + trees + score | PASS |
| embeds JPEG into a valid PDF byte stream | PASS |

### `tests/layout.test.ts` (5) — PASS

| Test | Outcome |
| --- | --- |
| popup is 360 × 520 | PASS |
| onboarding column max is 460 | PASS |
| popup App uses POPUP_WIDTH / POPUP_HEIGHT | PASS |
| onboarding App uses ONBOARDING_MAX_WIDTH | PASS |
| dashboard column 720–880 | PASS |

### `tests/adapter.test.ts` (3) — PASS

| Test | Outcome |
| --- | --- |
| ships versioned selectors (not a TODO stub) | PASS |
| queryBySelector returns null on bad CSS | PASS |
| missingSelectorKeys lists failed keys | PASS |

### `tests/backendClient.test.ts` (6) — PASS

| Test | Outcome |
| --- | --- |
| resolveBaseUrl defaults when empty | PASS |
| resolveBaseUrl strips trailing slash | PASS |
| resolveBaseUrl rejects non-http schemes | PASS |
| fetchHealth returns ok when /health status is ok | PASS |
| fetchHealth returns not ok on network failure | PASS |
| mapTipsToCards maps backend tip titles | PASS |

### `tests/draftCoach.test.ts` (2) — PASS

| Test | Outcome |
| --- | --- |
| holdSend returns suggestion within hold window | PASS |
| bypass skips hold once | PASS |

### `tests/upload.test.ts` (4) — PASS

| Test | Outcome |
| --- | --- |
| P1 ChatGPT user part increases usage by 1 | PASS |
| P2 garbage leaves usage unchanged and returns error | PASS |
| P3 empty file unchanged + error | PASS |
| P4 Claude human message adds one row | PASS |

### `tests/siteDetect.test.ts` (2) — PASS

| Test | Outcome |
| --- | --- |
| maps known hosts without Groq | PASS |
| maps Groq labels onto platform ids | PASS |

---

## Playwright E2E (10)

### `e2e/coach-redirect.spec.ts` (4) — PASS

| Test | Outcome | Notes |
| --- | --- | --- |
| ChatGPT → Gemini when both enabled and no model label | PASS | ~2.2s |
| Claude → Perplexity when both enabled and no model label | PASS | ~2.0s |
| only chatgpt enabled → no Mistral invent | PASS | ~0.1s |
| deepseek-only alternate skipped | PASS | ~0.2s |

### `e2e/groq-hop.spec.ts` (6) — PASS

| Test | Outcome | Notes |
| --- | --- | --- |
| weather ask → toast + Gemini tab (not Claude) | PASS | ~4.8s |
| define ask → toast + Gemini tab (not weather-only) | PASS | ~4.7s — proves hop is not weather-hardcoded |
| routeStay → no new tab when Groq says current site | PASS | ~3.3s |
| remounted contenteditable still hops | PASS | ~4.8s |
| Enter immediately hops to Gemini (no 2s wait) | PASS | ~2.6s |
| routeStay Enter sends locally, no new tab | PASS | ~0.5s |

---

## How to re-run

```bash
cd extension
npx vitest run
npm run build
npx playwright test e2e/groq-hop.spec.ts e2e/coach-redirect.spec.ts
```

Screenshots from hop e2e land in `extension/.verify7/` (e.g. `playwright-groq-hop-toast.png`).
