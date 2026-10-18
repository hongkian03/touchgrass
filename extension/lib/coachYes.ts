import platformsData from "../data/platforms.json";
import { classify } from "./classify";
import { coachTargetDisplay, type CoachTargetDisplay } from "./coachTargetDisplay";
import { pickEnabledAlternate, route } from "./route";
import { isExtensionContextError } from "./storage";
import type { Platform, RouteSuggestion } from "./types";

const platforms = platformsData as Platform[];

export function buildCoachSuggestion(args: {
  draft: string;
  model: string;
  provider: string;
  enabledPlatforms?: string[];
}): RouteSuggestion {
  const promptClass = classify(args.draft, "text");
  return route({
    promptClass,
    model: args.model,
    provider: args.provider,
    platforms,
    enabledPlatforms: args.enabledPlatforms ?? [],
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
    }
  | {
      kind: "noop";
      suggestion: RouteSuggestion;
    };

/** Resolve auto action. Does not open tabs yet. */
export function planCoachAuto(args: {
  draft: string;
  model: string;
  provider: string;
  modelLabel?: HTMLElement | null;
  enabledPlatforms?: string[];
}): CoachAutoResult {
  const enabled = args.enabledPlatforms ?? [];
  const suggestion = buildCoachSuggestion({
    draft: args.draft,
    model: args.model,
    provider: args.provider,
    enabledPlatforms: enabled,
  });

  if (suggestion.action === "switch_model" && args.modelLabel) {
    return {
      kind: "switched",
      suggestion,
      model: suggestion.targetModel,
    };
  }

  let url =
    suggestion.action === "open_paste" ? suggestion.targetUrl : undefined;

  // Same-site switch preferred but no label → open another enabled site.
  if (!url) {
    const alt = pickEnabledAlternate({
      enabledPlatforms: enabled,
      platforms,
      excludeProvider: args.provider,
      preferGemini: classify(args.draft, "text") !== "small_ok",
    });
    url = alt?.url;
  }

  if (!url || /deepseek/i.test(url)) {
    return { kind: "noop", suggestion };
  }

  return {
    kind: "redirect",
    suggestion: {
      ...suggestion,
      action: "open_paste",
      targetUrl: url,
      reason:
        classify(args.draft, "text") === "small_ok"
          ? "Simple ask · lighter model fit"
          : suggestion.reason,
    },
    url,
    target: coachTargetDisplay(url, platforms),
  };
}

export type ContextTurn = {
  role: "user" | "assistant";
  content: string;
};

/** Scrape up to maxTurns recent conversation turns from the current chat page. */
export function scrapeRecentMessages(
  root: ParentNode = document,
  maxTurns = 4,
  maxChars = 2400,
): ContextTurn[] {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(
      "[data-message-author-role], [data-testid='user-message'], [data-testid='assistant-message'], [data-markdown-text-style='assistant-message'], .font-user-message, .font-claude-message",
    ),
  );
  const turns: ContextTurn[] = [];
  for (const el of candidates) {
    const rawRole =
      el.getAttribute("data-message-author-role") ||
      (el.matches("[data-testid='user-message'], .font-user-message")
        ? "user"
        : "assistant");
    const role: "user" | "assistant" =
      rawRole === "user" ? "user" : "assistant";
    const content = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    if (!content) continue;
    turns.push({ role, content: content.slice(0, 600) });
  }
  const recent = turns.slice(-maxTurns);
  let total = 0;
  const bounded: ContextTurn[] = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const t = recent[i]!;
    if (total + t.content.length > maxChars) break;
    total += t.content.length;
    bounded.unshift(t);
  }
  return bounded;
}

/** Build a compact context carryover payload when hopping mid-conversation. */
export function formatHandoffDraft(args: {
  draft: string;
  recentMessages?: ContextTurn[];
  fromProvider?: string;
}): string {
  const cleanDraft = args.draft.trim();
  const turns = (args.recentMessages ?? []).filter(
    (m) => m.content.trim() && m.content.trim() !== cleanDraft,
  );
  if (turns.length === 0) return cleanDraft;

  const summary = turns
    .slice(-3)
    .map((m) => {
      const tag = m.role === "user" ? "User" : "Assistant";
      const snippet =
        m.content.length > 220 ? `${m.content.slice(0, 217)}...` : m.content;
      return `${tag}: ${snippet}`;
    })
    .join("\n");

  const sourceLabel = args.fromProvider
    ? `from ${args.fromProvider}`
    : "from previous chat";
  return `[Prior context ${sourceLabel}]\n${summary}\n\n[Question]\n${cleanDraft}`;
}

/** Apply same-page model switch (updates label + attempts native model dropdown selection when present). */
export function applyCoachSwitch(
  modelLabel: HTMLElement,
  model: string,
  root: ParentNode = document,
): boolean {
  modelLabel.textContent = model;
  modelLabel.setAttribute("data-coach-switched", model);

  // If the page has a native model menu / option matching the target small model, click it.
  const norm = model.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const tokens = norm.split(" ").filter((t) => t.length >= 3);
  try {
    const items = Array.from(
      root.querySelectorAll<HTMLElement>(
        "[role='menuitem'], [role='option'], [data-testid*='model']",
      ),
    );
    const match = items.find((el) => {
      if (el === modelLabel) return false;
      const txt = (el.textContent ?? "").toLowerCase();
      return tokens.some((tok) => txt.includes(tok));
    });
    if (match) {
      match.click();
      return true;
    }
  } catch {
    // non-fatal DOM fallback
  }
  return true;
}

/** Open paste tab (never DeepSeek), optionally carrying over recent conversation context. */
export async function openCoachPaste(args: {
  url: string;
  draft: string;
  recentMessages?: ContextTurn[];
  fromProvider?: string;
}): Promise<void> {
  if (/deepseek/i.test(args.url)) {
    throw new Error("refuse DeepSeek green route");
  }
  const payload = formatHandoffDraft({
    draft: args.draft,
    recentMessages: args.recentMessages,
    fromProvider: args.fromProvider,
  });
  try {
    await browser.runtime.sendMessage({
      type: "puddle/coach-open-paste",
      url: args.url,
      draft: payload,
    });
  } catch (e) {
    if (isExtensionContextError(e)) return;
    throw e;
  }
}

/** @deprecated Prefer planCoachAuto + apply/open. Kept for callers mid-migrate. */
export async function runCoachYes(args: {
  draft: string;
  model: string;
  provider: string;
  modelLabel?: HTMLElement | null;
  enabledPlatforms?: string[];
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
