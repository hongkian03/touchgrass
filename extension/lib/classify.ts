import type { PromptClass, PromptKind } from "./types";

/** Short asks a small model handles: chit-chat, quick facts, time, weather. */
const MAX_SMALL_CHARS = 200;

/** Signals that a prompt needs a frontier model: real work, not a quick ask. */
const HEAVY_HINT =
  /\b(refactor|design|derive|implement|critique|plan|compare|sketch|debug|propose|rewrite|build|architect|tune|model|write|code|program|analy[sz]e|optimi[sz]e|prove|essay|review|research|step[- ]by[- ]step|in detail)\b/i;

/** Code or math in the prompt. */
const CODE_HINT = /```|[{};]|=>|\w\(\w*\)\s*=/;

export function classify(
  promptText: string,
  kind: PromptKind,
): PromptClass {
  if (kind === "image" || kind === "video") return "needs_big";
  const text = promptText.trim();
  if (!text) return "needs_big";
  if (text.length > MAX_SMALL_CHARS) return "needs_big";
  if (HEAVY_HINT.test(text) || CODE_HINT.test(text)) return "needs_big";
  return "small_ok";
}

/** True when local classify says a short ask can hop off a heavy chat. */
export function isSimpleHopAsk(draft: string): boolean {
  return classify(draft.trim(), "text") === "small_ok";
}
