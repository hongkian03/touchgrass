import { classify } from "./classify";
import { urlForPlatformId } from "./route";
import type { FootprintModel } from "./totals";
import type { Platform } from "./types";

export type CoachChoice = "switch_here" | "open_other" | "send_anyway" | "not_now";

export type CoachChoiceRow = {
  ts: string;
  site: string;
  choice: CoachChoice;
  /** "button" = clicked in the toast; "send" = sent without picking (counts as send anyway). */
  via: "button" | "send";
  /** Toast shown before the send (while typing), after it, or as a periodic check-in. */
  timing: "before_send" | "after_send" | "check_in";
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

/** Check in after every Nth prompt in a row on a big model. */
export const CHECK_IN_EVERY = 5;

export function isCheckInDue(bigModelStreak: number): boolean {
  return bigModelStreak > 0 && bigModelStreak % CHECK_IN_EVERY === 0;
}

/** True when the page is on this site's big default (and a smaller one exists). */
export function isOnBigModel(platform: Platform | undefined, currentModel: string): boolean {
  if (!platform || platform.kind !== "text") return false;
  if (platform.smallModel === platform.defaultModel) return false;
  return currentModel === platform.defaultModel;
}

export type GreenerAlternative = {
  id: string;
  name: string;
  url: string;
  /** Lightest model on that AI (footprint key) and a readable label. */
  model: string;
  modelLabel: string;
  /** Estimated Wh saved per prompt vs the model in use now. */
  savedWh: number;
};

/** Readable names for each AI's lightest model. */
const MODEL_LABELS: Record<string, string> = {
  "gpt-4o-mini": "GPT-4o mini",
  "claude-haiku": "Haiku",
  "gemini-flash": "Flash",
  "grok-mini": "Grok mini",
  sonar: "Sonar",
  "deepseek-chat": "DeepSeek Chat",
};

/**
 * The LOWEST-power model across all the user's other selected AIs: each AI's
 * lightest model (smallModel), ranked by estimated Wh per prompt. Includes
 * DeepSeek. Returned only if it uses less than the model in use now.
 */
export function greenerAlternative(args: {
  enabledPlatforms: string[];
  platforms: Platform[];
  currentId: string;
  /** Footprint key of the model in use now (defaults to the site's big model). */
  currentModel?: string;
  models: Record<string, FootprintModel>;
}): GreenerAlternative | null {
  const current = args.platforms.find((p) => p.id === args.currentId);
  const currentWh =
    args.models[args.currentModel ?? current?.defaultModel ?? ""]?.Wh;
  if (currentWh === undefined) return null;
  let best: GreenerAlternative | null = null;
  for (const id of args.enabledPlatforms) {
    if (id === args.currentId) continue;
    const p = args.platforms.find((x) => x.id === id);
    if (!p || p.kind !== "text") continue;
    const model = p.smallModel || p.defaultModel;
    const wh = args.models[model]?.Wh;
    const url = urlForPlatformId(id, args.platforms);
    if (wh === undefined || !url || wh >= currentWh) continue;
    const savedWh = currentWh - wh;
    if (!best || savedWh > best.savedWh) {
      best = {
        id,
        name: p.name,
        url,
        model,
        modelLabel: MODEL_LABELS[model] ?? model,
        savedWh,
      };
    }
  }
  return best;
}
