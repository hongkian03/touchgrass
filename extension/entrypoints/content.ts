import coachCopy from "../data/coach-copy.json";
import platformsData from "../data/platforms.json";
import {
  COACH_TYPE_DEBOUNCE_MS,
  shouldShowCoach,
} from "../lib/coach";
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
    bootWatch();
  },
});

function bootWatch() {
  let debounceTimer: number | undefined;
  let acting = false;
  let bound: HTMLTextAreaElement | HTMLElement | null = null;

  const schedule = () => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      void maybeCoach();
    }, COACH_TYPE_DEBOUNCE_MS);
  };

  const maybeCoach = async () => {
    if (acting) return;
    const composer = findComposer();
    if (!composer) return;
    ensureBound(composer);

    const state = await readState();
    if (!shouldShowCoach(state.lastCoachAt)) return;

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

    if (plan.kind === "noop") return;

    acting = true;
    try {
      if (plan.kind === "switched" && modelLabel) {
        applyCoachSwitch(modelLabel, plan.model);
        mountCoach({
          shadow: true,
          message: coachCopy.switched.replace("{model}", plan.model),
        });
        await writeState({ lastCoachAt: Date.now() });
        window.setTimeout(() => unmountCoach(), SWITCH_HOLD_MS);
        return;
      }

      if (plan.kind !== "redirect") return;

      mountCoach({
        shadow: true,
        message: coachCopy.redirecting.replace("{name}", plan.target.name),
        target: plan.target,
      });

      await new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), REDIRECT_MS);
      });

      try {
        await openCoachPaste({
          url: plan.url,
          draft: draftFrom(composer),
        });
      } finally {
        await writeState({ lastCoachAt: Date.now() });
        unmountCoach();
      }
    } finally {
      acting = false;
    }
  };

  const ensureBound = (composer: HTMLTextAreaElement | HTMLElement) => {
    if (bound === composer) return;
    if (bound) {
      bound.removeEventListener("input", schedule);
      bound.removeEventListener("keyup", schedule);
    }
    bound = composer;
    bound.addEventListener("input", schedule);
    bound.addEventListener("keyup", schedule);
  };

  const attach = () => {
    const composer = findComposer();
    if (composer) ensureBound(composer);
  };

  attach();
  // Chat apps remount the composer often
  const mo = new MutationObserver(() => attach());
  mo.observe(document.documentElement, { childList: true, subtree: true });
}
