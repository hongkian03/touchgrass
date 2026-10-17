import platformsData from "../data/platforms.json";
import { hostsForPlatforms } from "./hosts";
import type { Platform } from "./types";

const platforms = platformsData as Platform[];

export const COACH_SCRIPT_ID = "puddle-coach";
export const COACH_SCRIPT_FILE = "content-scripts/content.js";

/** All platform host patterns for content-script matches. */
export function allPlatformMatchPatterns(): string[] {
  return [
    ...new Set(platforms.flatMap((p) => p.hosts).filter(Boolean)),
  ];
}

/** URL patterns for tabs.query / inject from enabled platform ids. */
export function injectPatternsForEnabled(
  enabledPlatforms: string[],
): string[] {
  if (enabledPlatforms.length === 0) return allPlatformMatchPatterns();
  return hostsForPlatforms(enabledPlatforms, platforms);
}

/** Patterns currently granted ∩ platform hosts (fallback: all platform hosts). */
export async function grantedPlatformMatches(): Promise<string[]> {
  const all = allPlatformMatchPatterns();
  try {
    const perms = await browser.permissions.getAll();
    const origins = perms.origins ?? [];
    if (origins.length === 0) return all;
    const granted = all.filter((pattern) =>
      origins.some(
        (o) => o === pattern || o === "*://*/*" || originsIncludes(o, pattern),
      ),
    );
    return granted.length > 0 ? granted : all;
  } catch {
    return all;
  }
}

function originsIncludes(granted: string, pattern: string): boolean {
  // rough: https://claude.ai/* vs https://claude.ai/*
  try {
    const g = granted.replace("/*", "").replace("*", "");
    const p = pattern.replace("/*", "").replace("*", "");
    return p.startsWith(g) || g.startsWith(p) || granted === pattern;
  } catch {
    return false;
  }
}

/**
 * Register runtime content script for granted AI hosts, then inject
 * into already-open matching tabs.
 */
export async function rebindCoachScripts(
  enabledPlatforms: string[] = [],
): Promise<{ matches: string[]; injected: number }> {
  const matches =
    enabledPlatforms.length > 0
      ? injectPatternsForEnabled(enabledPlatforms)
      : await grantedPlatformMatches();

  const unique = [...new Set(matches)];
  if (unique.length === 0) return { matches: [], injected: 0 };

  try {
    const existing = await browser.scripting.getRegisteredContentScripts({
      ids: [COACH_SCRIPT_ID],
    });
    if (existing.length > 0) {
      await browser.scripting.unregisterContentScripts({
        ids: [COACH_SCRIPT_ID],
      });
    }
  } catch {
    // none registered yet
  }

  try {
    await browser.scripting.registerContentScripts([
      {
        id: COACH_SCRIPT_ID,
        js: [COACH_SCRIPT_FILE],
        matches: unique,
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
  } catch (e) {
    console.warn("[Touchgrass] registerContentScripts failed", e);
  }

  let injected = 0;
  try {
    const tabs = await browser.tabs.query({ url: unique });
    for (const tab of tabs) {
      if (tab.id == null) continue;
      try {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: [COACH_SCRIPT_FILE],
        });
        injected += 1;
      } catch {
        // tab may reject injection (chrome:// etc.)
      }
    }
  } catch {
    // query failed
  }

  return { matches: unique, injected };
}
