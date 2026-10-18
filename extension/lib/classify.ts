import type { PromptClass, PromptKind } from "./types";

/** Short factoid / lookup cues — not a single weather string. */
const SMALL_HINT =
  /what is|what's|whats|who is|weather|define|translate|summarize|how many|capital of|look up|lookup/i;

export function classify(
  promptText: string,
  kind: PromptKind,
): PromptClass {
  if (kind === "image" || kind === "video") return "needs_big";
  if (promptText.length < 80 && SMALL_HINT.test(promptText)) return "small_ok";
  return "needs_big";
}

/** True when local classify says a short ask can hop off a heavy chat. */
export function isSimpleHopAsk(draft: string): boolean {
  return classify(draft.trim(), "text") === "small_ok";
}
