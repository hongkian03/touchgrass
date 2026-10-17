import type { PromptClass, PromptKind } from "./types";

const SMALL_HINT = /what is|who is|weather|define|translate|summarize/i;

export function classify(
  promptText: string,
  kind: PromptKind,
): PromptClass {
  if (kind === "image" || kind === "video") return "needs_big";
  if (promptText.length < 80 && SMALL_HINT.test(promptText)) return "small_ok";
  return "needs_big";
}
