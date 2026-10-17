/** Resolve which AI product the tab is on (platforms.json first, else Groq). */

import platformsData from "../data/platforms.json";
import type { Platform } from "./types";
import { providerFromHostname } from "./route";

const platforms = platformsData as Platform[];

export function siteFromHostname(hostname: string): string | null {
  return providerFromHostname(hostname, platforms);
}

/** Map a Groq display label / hostname to a short site id for /classify. */
export function siteIdFromLabel(
  label: string | undefined,
  hostname: string,
): string {
  const blob = `${label ?? ""} ${hostname}`.toLowerCase();
  for (const p of platforms) {
    if (blob.includes(p.id)) return p.id;
    if (p.name && blob.includes(p.name.toLowerCase())) return p.id;
    for (const host of p.hosts) {
      try {
        const h = new URL(host.includes("://") ? host : `https://${host}`)
          .hostname;
        if (hostname === h || hostname.endsWith(`.${h}`) || blob.includes(h)) {
          return p.id;
        }
      } catch {
        /* ignore bad host patterns */
      }
    }
  }
  const slug = (label || hostname.split(".")[0] || "ai")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || "ai";
}

/**
 * Content-script helper: known host → id; else ask background Groq
 * (`puddle/classify-ai-site`). Non-AI tabs return null.
 */
export async function resolveActiveSite(
  hostname: string = location.hostname,
): Promise<{ site: string; label?: string; via: "host" | "groq" } | null> {
  const known = siteFromHostname(hostname);
  if (known) return { site: known, via: "host" };

  try {
    const verdict = (await browser.runtime.sendMessage({
      type: "puddle/classify-ai-site",
      hostname,
    })) as { isAi?: boolean; label?: string; error?: string };
    if (!verdict?.isAi) return null;
    return {
      site: siteIdFromLabel(verdict.label, hostname),
      label: verdict.label,
      via: "groq",
    };
  } catch {
    return null;
  }
}
