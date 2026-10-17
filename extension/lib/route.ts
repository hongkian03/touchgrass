import type { Platform, PromptClass, RouteSuggestion } from "./types";

const MISTRAL = "https://chat.mistral.ai/";
const GEMINI = "https://gemini.google.com/app";

export function route(args: {
  promptClass: PromptClass;
  model: string;
  provider: string;
  platforms: Platform[];
}): RouteSuggestion {
  const platform = args.platforms.find((p) => p.id === args.provider);
  const small = platform?.smallModel;

  if (args.promptClass === "small_ok" && small && args.model !== small) {
    return {
      action: "switch_model",
      targetModel: small,
      reason: `Same-site small model (${small}) is enough`,
    };
  }

  if (args.promptClass === "small_ok") {
    return {
      action: "open_paste",
      targetUrl: MISTRAL,
      targetModel: "mistral-small",
      reason: "French nuclear-heavy grid chat for simple asks",
    };
  }

  return {
    action: "open_paste",
    targetUrl: GEMINI,
    targetModel: "gemini-flash",
    reason: "Fallback capable model",
  };
}

export function routeTargetHost(suggestion: RouteSuggestion): string {
  if (!suggestion.targetUrl) return "";
  try {
    return new URL(suggestion.targetUrl).host;
  } catch {
    return "";
  }
}
