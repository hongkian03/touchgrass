import platformsData from "../data/platforms.json";
import { classify } from "./classify";
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

/** Try same-page model switch; else open paste tab (never DeepSeek). */
export async function runCoachYes(args: {
  draft: string;
  model: string;
  provider: string;
  /** fixture / page model label node */
  modelLabel?: HTMLElement | null;
}): Promise<RouteSuggestion> {
  const suggestion = buildCoachSuggestion(args);

  if (suggestion.action === "switch_model" && args.modelLabel) {
    args.modelLabel.textContent = suggestion.targetModel;
    return suggestion;
  }

  const url =
    suggestion.targetUrl ??
    (suggestion.action === "switch_model"
      ? "https://chat.mistral.ai/"
      : "https://gemini.google.com/app");

  if (/deepseek/i.test(url)) {
    throw new Error("refuse DeepSeek green route");
  }

  await browser.runtime.sendMessage({
    type: "puddle/coach-open-paste",
    url,
    draft: args.draft,
  });

  return { ...suggestion, action: "open_paste", targetUrl: url };
}
