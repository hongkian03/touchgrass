import platformsData from "../data/platforms.json";
import { classify } from "./classify";
import { coachTargetDisplay, type CoachTargetDisplay } from "./coachTargetDisplay";
import { route } from "./route";
import type { Platform, RouteSuggestion } from "./types";

const platforms = platformsData as Platform[];

export function buildCoachSuggestion(args: {
  draft: string;
  model: string;
  provider: string;
}): RouteSuggestion {
  const promptClass = classify(args.draft, "text");
  return route({
    promptClass,
    model: args.model,
    provider: args.provider,
    platforms,
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
    };

/** Resolve auto action. Does not open tabs yet. */
export function planCoachAuto(args: {
  draft: string;
  model: string;
  provider: string;
  modelLabel?: HTMLElement | null;
}): CoachAutoResult {
  const suggestion = buildCoachSuggestion(args);

  if (suggestion.action === "switch_model" && args.modelLabel) {
    return {
      kind: "switched",
      suggestion,
      model: suggestion.targetModel,
    };
  }

  const url =
    suggestion.targetUrl ??
    (suggestion.action === "switch_model"
      ? "https://chat.mistral.ai/"
      : "https://gemini.google.com/app");

  if (/deepseek/i.test(url)) {
    throw new Error("refuse DeepSeek green route");
  }

  return {
    kind: "redirect",
    suggestion: { ...suggestion, action: "open_paste", targetUrl: url },
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
