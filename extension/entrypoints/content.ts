import coachCopy from "../data/coach-copy.json";
import platformsData from "../data/platforms.json";
import { shouldShowCoach } from "../lib/coach";
import { mountCoach, unmountCoach } from "../lib/coachMount";
import {
  applyCoachSwitch,
  openCoachPaste,
  planCoachAuto,
} from "../lib/coachYes";
import { classify } from "../lib/classify";
import { providerFromHostname } from "../lib/route";
import { readState, writeState } from "../lib/storage";
import type { Platform } from "../lib/types";

const platforms = platformsData as Platform[];
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

  const provider =
    providerFromHostname(location.hostname, platforms) ?? "chatgpt";
  const platform = platforms.find((p) => p.id === provider);
  const modelLabel = findModelLabel();
  const model =
    modelLabel?.textContent?.trim() ||
    platform?.defaultModel ||
    "gpt-5";

  const plan = planCoachAuto({
    draft,
    model,
    provider,
    modelLabel,
    enabledPlatforms: state.enabledPlatforms,
  });

  if (plan.kind === "switched" && modelLabel) {
    applyCoachSwitch(modelLabel, plan.model);
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
