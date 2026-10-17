import { isAllowedAiHost } from "./aiSites";
import type { Platform } from "./types";

const CUSTOM_PREFIX = "custom:";

/** Brand aliases → platform id (core host labels). */
const HOST_ALIASES: Record<string, string> = {
  "chatgpt.com": "chatgpt",
  "openai.com": "chatgpt",
  "chat.openai.com": "chatgpt",
  "claude.ai": "claude",
  "anthropic.com": "claude",
  "gemini.google.com": "gemini",
  "bard.google.com": "gemini",
  "perplexity.ai": "perplexity",
  "www.perplexity.ai": "perplexity",
  "grok.com": "grok",
  "x.ai": "grok",
  "x.com": "grok",
  "twitter.com": "grok",
  "deepseek.com": "deepseek",
  "chat.deepseek.com": "deepseek",
  "midjourney.com": "midjourney",
  "www.midjourney.com": "midjourney",
  "playground.com": "flux",
  "blackforestlabs.ai": "flux",
};

export type ResolveResult =
  | { ok: true; id: string; hosts: string[]; hostname: string }
  | { ok: false; reason: "invalid" | "not_ai"; hostname?: string };

/** custom:example.com → https://example.com/* */
export function isCustomPlatformId(id: string): boolean {
  return id.startsWith(CUSTOM_PREFIX);
}

export function customPlatformId(hostname: string): string {
  return `${CUSTOM_PREFIX}${hostname.toLowerCase()}`;
}

export function hostnameFromCustomId(id: string): string | null {
  if (!isCustomPlatformId(id)) return null;
  const host = id.slice(CUSTOM_PREFIX.length).trim().toLowerCase();
  return host || null;
}

/** Strip www. and lowercase. */
export function coreHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, "");
}

/**
 * Pull the site host out of a pasted URL / bare domain.
 * https://chatgpt.com/c/abc?foo=1 → chatgpt.com
 */
export function extractHostname(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname || url.hostname === "localhost") return null;
    if (!url.hostname.includes(".")) return null;
    return coreHostname(url.hostname);
  } catch {
    return null;
  }
}

/** Host plus parent domains: chat.openai.com → [chat.openai.com, openai.com] */
export function hostLadder(hostname: string): string[] {
  const h = coreHostname(hostname);
  const parts = h.split(".").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    out.push(parts.slice(i).join("."));
  }
  return out;
}

/** Accepts bare domain or full URL → https://host/* pattern, or null. */
export function originPatternFromInput(raw: string): string | null {
  const host = extractHostname(raw);
  if (!host) return null;
  return `https://${host}/*`;
}

function hostFromPattern(pattern: string): string {
  try {
    return coreHostname(new URL(pattern.replace("/*", "/")).hostname);
  } catch {
    return "";
  }
}

/**
 * Match typed URL to a known / allowlisted AI platform.
 * Rejects non-AI sites (youtube, news, etc.).
 */
export function resolvePlatformFromInput(
  raw: string,
  platforms: Platform[],
): ResolveResult {
  const hostname = extractHostname(raw);
  if (!hostname) return { ok: false, reason: "invalid" };
  const ladder = hostLadder(hostname);

  // 1) explicit aliases (openai.com → chatgpt, etc.)
  for (const candidate of ladder) {
    const aliasId = HOST_ALIASES[candidate];
    if (!aliasId) continue;
    const p = platforms.find((x) => x.id === aliasId);
    return {
      ok: true,
      id: aliasId,
      hosts: p?.hosts ?? [`https://${hostname}/*`],
      hostname,
    };
  }

  // 2) match against each platform's declared hosts
  for (const p of platforms) {
    const declared = p.hosts.map(hostFromPattern).filter(Boolean);
    const hit = ladder.some((cand) =>
      declared.some(
        (d) => d === cand || d.endsWith(`.${cand}`) || cand.endsWith(`.${d}`),
      ),
    );
    if (hit) return { ok: true, id: p.id, hosts: p.hosts, hostname };
  }

  // 3) name / id fuzzy (user typed "claude" or "ChatGPT")
  const q = raw.trim().toLowerCase();
  const byName = platforms.find(
    (p) =>
      p.id === q ||
      p.name.toLowerCase() === q ||
      p.name.toLowerCase().replace(/[^a-z0-9]/g, "") ===
        q.replace(/[^a-z0-9]/g, ""),
  );
  if (byName) {
    return { ok: true, id: byName.id, hosts: byName.hosts, hostname };
  }

  // 4) curated AI allowlist → custom tile with favicon
  if (isAllowedAiHost(hostname)) {
    return {
      ok: true,
      id: customPlatformId(hostname),
      hosts: [`https://${hostname}/*`],
      hostname,
    };
  }

  return { ok: false, reason: "not_ai", hostname };
}

/** Favicon URL for a custom / unknown site. */
export function faviconForHost(hostname: string): string {
  const h = coreHostname(hostname);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=64`;
}

/** Origins to request for the selected platform ids. */
export function hostsForPlatforms(
  selectedIds: string[],
  platforms: Platform[],
): string[] {
  const set = new Set<string>();
  for (const id of selectedIds) {
    const customHost = hostnameFromCustomId(id);
    if (customHost) {
      set.add(`https://${customHost}/*`);
      continue;
    }
    const p = platforms.find((x) => x.id === id);
    if (!p) continue;
    for (const h of p.hosts) set.add(h);
  }
  return [...set];
}

export function canContinueOnboarding(selectedCount: number): boolean {
  return selectedCount >= 1;
}
