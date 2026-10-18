import { classify } from "./classify";
import type { Platform } from "./types";

export type CoachChoice = "switch_here" | "open_other" | "send_anyway";

export type CoachChoiceRow = {
  ts: string;
  site: string;
  choice: CoachChoice;
  /** "button" = clicked in the toast; "send" = sent without picking (counts as send anyway). */
  via: "button" | "send";
  /** Toast shown before the send (while typing) or after it. */
  timing: "before_send" | "after_send";
  /** Platform id the prompt was carried to (open_other). */
  target?: string;
  /** What actually happened: e.g. "prefilled", "copied", "picked", "menu_open". */
  outcome?: string;
};

/**
 * Sites that read the prompt from the URL. Others get the clipboard fallback.
 * Gemini has no supported prefill parameter.
 */
const PREFILL: Record<string, (q: string) => string> = {
  chatgpt: (q) => `https://chatgpt.com/?q=${q}`,
  claude: (q) => `https://claude.ai/new?q=${q}`,
  perplexity: (q) => `https://www.perplexity.ai/search?q=${q}`,
  grok: (q) => `https://grok.com/?q=${q}`,
};

/** Keep prefill URLs well under browser / server limits. */
export const MAX_PREFILL_CHARS = 1500;

export function prefillUrl(platformId: string, text: string): string | null {
  const build = PREFILL[platformId];
  if (!build || !text || text.length > MAX_PREFILL_CHARS) return null;
  return build(encodeURIComponent(text));
}

/** Simple ask on this site's big model → offer the choice toast. */
export function shouldOfferChoice(args: {
  text: string;
  platform: Platform | undefined;
  currentModel: string;
}): boolean {
  const { text, platform, currentModel } = args;
  if (!platform || platform.kind !== "text") return false;
  if (currentModel !== platform.defaultModel) return false;
  return classify(text, "text") === "small_ok";
}

/** Page labels that mean "small model" in each site's model menu. */
export const SMALL_MENU_RE = /mini|haiku|flash|lite|nano|instant|fast/i;

/**
 * Open the site's model menu and pick a small model if one is listed.
 * Returns "picked" or "menu_open" (menu left open for the user), or "no_menu".
 */
export async function switchModelHere(
  modelButton: HTMLElement | null,
  root?: ParentNode,
  waitMs = 350,
): Promise<"picked" | "menu_open" | "no_menu"> {
  if (!modelButton) return "no_menu";
  modelButton.click();
  await new Promise((r) => setTimeout(r, waitMs));
  const items = Array.from(
    (root ?? document).querySelectorAll<HTMLElement>("[role='menuitem'], [role='option'], [role='menuitemradio']"),
  );
  const small = items.find((el) => SMALL_MENU_RE.test(el.textContent ?? ""));
  if (!small) return "menu_open";
  small.click();
  return "picked";
}
