import { classify } from "./classify";
import { route, routeTargetHost } from "./route";
import type { Platform, RouteSuggestion } from "./types";

export type VoiceIntent =
  | { kind: "recap" }
  | { kind: "weather"; suggestion: RouteSuggestion; reason: string }
  | { kind: "unknown" };

const RECAP = /hey\s+pip.*(weekly|report|recap)|weekly\s+report|show\s+recap/i;
const WEATHER = /weather/i;

export function parseVoiceIntent(
  text: string,
  platforms: Platform[],
  enabledPlatforms: string[] = [],
): VoiceIntent {
  const t = text.trim();
  if (!t) return { kind: "unknown" };
  if (RECAP.test(t)) return { kind: "recap" };
  if (WEATHER.test(t)) {
    const suggestion = route({
      promptClass: classify(t, "text"),
      model: "gpt-5",
      provider: "chatgpt",
      platforms,
      enabledPlatforms,
    });
    const host = routeTargetHost(suggestion);
    if (
      host === "chat.deepseek.com" ||
      /deepseek/i.test(suggestion.targetUrl ?? "")
    ) {
      return { kind: "unknown" };
    }
    if (suggestion.action === "open_paste" && !suggestion.targetUrl) {
      return { kind: "unknown" };
    }
    return {
      kind: "weather",
      suggestion,
      reason: suggestion.reason,
    };
  }
  return { kind: "unknown" };
}
