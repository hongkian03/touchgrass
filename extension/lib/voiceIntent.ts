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
    });
    const host = routeTargetHost(suggestion);
    if (host === "chat.deepseek.com" || /deepseek/i.test(suggestion.targetUrl ?? "")) {
      // never green-route DeepSeek
      return {
        kind: "weather",
        suggestion: {
          action: "open_paste",
          targetUrl: "https://chat.mistral.ai/",
          targetModel: "mistral-small",
          reason: "Simple weather ask. A small model is enough",
        },
        reason: "Simple weather ask. A small model is enough",
      };
    }
    return {
      kind: "weather",
      suggestion,
      reason: suggestion.reason,
    };
  }
  return { kind: "unknown" };
}
