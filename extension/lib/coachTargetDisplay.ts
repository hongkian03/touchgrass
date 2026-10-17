import platformsData from "../data/platforms.json";
import { faviconForHost, resolvePlatformFromInput } from "./hosts";
import type { Platform } from "./types";

const platforms = platformsData as Platform[];

export type CoachTargetDisplay = {
  name: string;
  iconSlug?: string;
  faviconUrl?: string;
};

const HOST_LABELS: Record<string, string> = {
  "chat.mistral.ai": "Mistral",
  "mistral.ai": "Mistral",
  "gemini.google.com": "Gemini",
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "claude.ai": "Claude",
};

function labelForHost(hostname: string): string {
  const h = hostname.replace(/^www\./, "").toLowerCase();
  if (HOST_LABELS[h]) return HOST_LABELS[h];
  for (const [key, label] of Object.entries(HOST_LABELS)) {
    if (h === key || h.endsWith(`.${key}`)) return label;
  }
  const base = h.split(".")[0] ?? h;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Name + brand icon (or favicon) for a coach open-paste URL. */
export function coachTargetDisplay(
  url: string,
  list: Platform[] = platforms,
): CoachTargetDisplay {
  const resolved = resolvePlatformFromInput(url, list);
  if (resolved.ok) {
    const known = list.find((p) => p.id === resolved.id);
    if (known) {
      return { name: known.name, iconSlug: known.icon };
    }
    const host = resolved.hostname ?? "";
    return {
      name: labelForHost(host),
      faviconUrl: faviconForHost(host),
    };
  }
  try {
    const host = new URL(url).hostname;
    return {
      name: labelForHost(host),
      faviconUrl: faviconForHost(host),
    };
  } catch {
    return { name: "another AI" };
  }
}
