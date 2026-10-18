import platformsData from "../data/platforms.json";
import { classify } from "./classify";
import { coachTargetDisplay, type CoachTargetDisplay } from "./coachTargetDisplay";
import { pickEnabledAlternate, route } from "./route";
import type { Platform, RouteSuggestion } from "./types";

const platforms = platformsData as Platform[];

export function buildCoachSuggestion(args: {
  draft: string;
  model: string;
  provider: string;
  enabledPlatforms?: string[];
}): RouteSuggestion {
  const promptClass = classify(args.draft, "text");
  return route({
    promptClass,
    model: args.model,
    provider: args.provider,
    platforms,
    enabledPlatforms: args.enabledPlatforms ?? [],
  });
}

export type CoachAutoResult =
  | {
      kind: "switched";
      suggestion: RouteSuggestion;
      model: string;
    }
  | {
      kind: "redirect";
      suggestion: RouteSuggestion;
      url: string;
      target: CoachTargetDisplay;
    }
  | {
      kind: "noop";
      suggestion: RouteSuggestion;
    };

/** Resolve auto action. Does not open tabs yet. */
export function planCoachAuto(args: {
  draft: string;
  model: string;
  provider: string;
  modelLabel?: HTMLElement | null;
  enabledPlatforms?: string[];
}): CoachAutoResult {
  const enabled = args.enabledPlatforms ?? [];
  const suggestion = buildCoachSuggestion({
    draft: args.draft,
    model: args.model,
    provider: args.provider,
    enabledPlatforms: enabled,
  });

  if (suggestion.action === "switch_model" && args.modelLabel) {
    return {
      kind: "switched",
      suggestion,
      model: suggestion.targetModel,
    };
  }

  let url =
    suggestion.action === "open_paste" ? suggestion.targetUrl : undefined;

  // Same-site switch preferred but no label → open another enabled site.
  if (!url) {
    const alt = pickEnabledAlternate({
      enabledPlatforms: enabled,
      platforms,
      excludeProvider: args.provider,
      preferGemini: classify(args.draft, "text") !== "small_ok",
    });
    url = alt?.url;
  }

  if (!url || /deepseek/i.test(url)) {
    return { kind: "noop", suggestion };
  }

  return {
    kind: "redirect",
    suggestion: {
      ...suggestion,
      action: "open_paste",
      targetUrl: url,
      reason:
        classify(args.draft, "text") === "small_ok"
          ? "Simple ask · lighter model fit"
          : suggestion.reason,
    },
    url,
    target: coachTargetDisplay(url, platforms),
  };
}

/** Apply same-page model switch. */
export function applyCoachSwitch(
  modelLabel: HTMLElement,
  model: string,
): void {
  modelLabel.textContent = model;
}

/** Open paste tab (never DeepSeek). */
export async function openCoachPaste(args: {
  url: string;
  draft: string;
}): Promise<void> {
  if (/deepseek/i.test(args.url)) {
    throw new Error("refuse DeepSeek green route");
  }
  await browser.runtime.sendMessage({
    type: "puddle/coach-open-paste",
    url: args.url,
    draft: args.draft,
  });
}

/** @deprecated Prefer planCoachAuto + apply/open. Kept for callers mid-migrate. */
export async function runCoachYes(args: {
  draft: string;
  model: string;
  provider: string;
  modelLabel?: HTMLElement | null;
  enabledPlatforms?: string[];
}): Promise<RouteSuggestion> {
  const plan = planCoachAuto(args);
  if (plan.kind === "switched" && args.modelLabel) {
    applyCoachSwitch(args.modelLabel, plan.model);
    return plan.suggestion;
  }
  if (plan.kind === "redirect") {
    await openCoachPaste({ url: plan.url, draft: args.draft });
    return plan.suggestion;
  }
  return buildCoachSuggestion(args);
}
