import coachCopy from "../data/coach-copy.json";
import { shouldShowCoach } from "../lib/coach";
import { mountCoach, unmountCoach } from "../lib/coachMount";
import {
  applyCoachSwitch,
  openCoachPaste,
  planCoachAuto,
} from "../lib/coachYes";
import { classify } from "../lib/classify";
import { readState, writeState } from "../lib/storage";

const REDIRECT_MS = 1600;
const SWITCH_HOLD_MS = 1800;

function findComposer(): HTMLTextAreaElement | HTMLElement | null {
  return (
    document.querySelector<HTMLTextAreaElement>("textarea") ||
    document.querySelector<HTMLElement>("[contenteditable='true']")
  );
}

function draftFrom(el: HTMLTextAreaElement | HTMLElement): string {
  if (el instanceof HTMLTextAreaElement) return el.value;
  return el.textContent ?? "";
}

function findModelLabel(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    "#model-label, [data-testid='model-switcher'], [data-testid='model-selector']",
  );
}

export default defineContentScript({
  // Matches for WXT typing only. registration:runtime keeps
  // content_scripts [] until chrome.permissions.request (#4).
  matches: ["https://chatgpt.com/*", "https://claude.ai/*"],
  registration: "runtime",
  main() {
    void boot();
  },
});

async function boot() {
  const state = await readState();
  if (!shouldShowCoach(state.lastCoachAt)) return;

  const composer = findComposer();
  if (!composer) return;
  const draft = draftFrom(composer).trim();
  if (!draft) return;
  if (classify(draft, "text") !== "small_ok") return;

  const plan = planCoachAuto({
    draft,
    model: "gpt-5",
    provider: "chatgpt",
    modelLabel: findModelLabel(),
  });

  if (plan.kind === "switched" && findModelLabel()) {
    applyCoachSwitch(findModelLabel()!, plan.model);
    mountCoach({
      shadow: true,
      message: coachCopy.switched.replace("{model}", plan.model),
      composer,
    });
    await writeState({ lastCoachAt: Date.now() });
    window.setTimeout(() => unmountCoach(), SWITCH_HOLD_MS);
    return;
  }

  if (plan.kind !== "redirect") return;

  mountCoach({
    shadow: true,
    message: coachCopy.redirecting.replace("{name}", plan.target.name),
    composer,
    target: plan.target,
  });

  window.setTimeout(() => {
    void (async () => {
      try {
        await openCoachPaste({
          url: plan.url,
          draft: draftFrom(composer),
        });
      } finally {
        await writeState({ lastCoachAt: Date.now() });
        unmountCoach();
      }
    })();
  }, REDIRECT_MS);
}
