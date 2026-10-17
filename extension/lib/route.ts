import {
  hostnameFromCustomId,
  isCustomPlatformId,
  resolvePlatformFromInput,
} from "./hosts";
import type { Platform, PromptClass, RouteSuggestion } from "./types";

const IMAGE_KINDS = new Set(["image", "video"]);

export type AlternateTarget = {
  id: string;
  url: string;
  model: string;
};

/** Host pattern `https://x.com/*` → openable origin URL. */
export function platformOpenUrl(platform: Platform): string {
  const raw = platform.hosts[0] ?? "";
  try {
    const u = new URL(raw.replace("/*", "/").replace(/\*$/, ""));
    return `${u.origin}/`;
  } catch {
    return raw.replace(/\/?\*$/, "/");
  }
}

export function urlForPlatformId(
  id: string,
  platforms: Platform[],
): string | null {
  const customHost = hostnameFromCustomId(id);
  if (customHost) return `https://${customHost}/`;
  const p = platforms.find((x) => x.id === id);
  if (!p) return null;
  const url = platformOpenUrl(p);
  return url;
}

/** Resolve provider id from page hostname (chatgpt.com → chatgpt). */
export function providerFromHostname(
  hostname: string,
  platforms: Platform[],
): string | null {
  const resolved = resolvePlatformFromInput(`https://${hostname}/`, platforms);
  if (!resolved.ok) return null;
  return resolved.id;
}

/**
 * First enabled alternate the user picked.
 * Skips current provider + DeepSeek. Prefers text over image/video.
 * When preferGemini, tries gemini first if enabled.
 */
export function pickEnabledAlternate(args: {
  enabledPlatforms: string[];
  platforms: Platform[];
  excludeProvider: string;
  preferGemini?: boolean;
}): AlternateTarget | null {
  const enabled = args.enabledPlatforms.filter(Boolean);
  if (enabled.length === 0) return null;

  const candidates = enabled.filter(
    (id) =>
      id !== args.excludeProvider &&
      id !== "deepseek" &&
      !/deepseek/i.test(id),
  );
  if (candidates.length === 0) return null;

  const ordered =
    args.preferGemini && candidates.includes("gemini")
      ? ["gemini", ...candidates.filter((id) => id !== "gemini")]
      : candidates;

  const resolve = (id: string): AlternateTarget | null => {
    if (isCustomPlatformId(id)) {
      const url = urlForPlatformId(id, args.platforms);
      if (!url) return null;
      return { id, url, model: "default" };
    }
    const p = args.platforms.find((x) => x.id === id);
    if (!p) return null;
    const url = urlForPlatformId(id, args.platforms);
    if (!url) return null;
    return { id, url, model: p.smallModel || p.defaultModel };
  };

  const textHit = ordered.find((id) => {
    if (isCustomPlatformId(id)) return true;
    const p = args.platforms.find((x) => x.id === id);
    return p && !IMAGE_KINDS.has(String(p.kind));
  });
  if (textHit) {
    const t = resolve(textHit);
    if (t) return t;
  }

  for (const id of ordered) {
    const t = resolve(id);
    if (t) return t;
  }
  return null;
}

export function route(args: {
  promptClass: PromptClass;
  model: string;
  provider: string;
  platforms: Platform[];
  enabledPlatforms?: string[];
}): RouteSuggestion {
  const enabled = args.enabledPlatforms ?? [];
  const platform = args.platforms.find((p) => p.id === args.provider);
  const small = platform?.smallModel;

  if (args.promptClass === "small_ok" && small && args.model !== small) {
    return {
      action: "switch_model",
      targetModel: small,
      reason: `Same-site small model (${small}) is enough`,
    };
  }

  const alt = pickEnabledAlternate({
    enabledPlatforms: enabled,
    platforms: args.platforms,
    excludeProvider: args.provider,
    preferGemini: args.promptClass !== "small_ok",
  });

  if (alt) {
    return {
      action: "open_paste",
      targetUrl: alt.url,
      targetModel: alt.model,
      reason:
        args.promptClass === "small_ok"
          ? "Simple ask. Open a lighter chat you enabled"
          : "Open a capable model from your list",
    };
  }

  if (small) {
    return {
      action: "switch_model",
      targetModel: small,
      reason: `Same-site small model (${small}) is enough`,
    };
  }

  return {
    action: "switch_model",
    targetModel: args.model || platform?.defaultModel || "unknown",
    reason: "No other enabled platform to open",
  };
}

export function routeTargetHost(suggestion: RouteSuggestion): string {
  if (!suggestion.targetUrl) return "";
  try {
    return new URL(suggestion.targetUrl).host;
  } catch {
    return "";
  }
}
