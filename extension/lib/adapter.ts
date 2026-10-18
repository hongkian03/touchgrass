/** Versioned DOM adapters (JSON data only — never eval). */

import bundledChatgpt from "../adapters/chatgpt.json";

export type SiteAdapter = {
  site: string;
  version: number;
  selectors: Record<string, string>;
};

const STORAGE_KEY = "siteAdapters";

const BUNDLED: Record<string, SiteAdapter> = {
  chatgpt: bundledChatgpt as SiteAdapter,
};

export function bundledAdapter(site: string): SiteAdapter | null {
  return BUNDLED[site] ?? null;
}

export async function readCachedAdapters(): Promise<Record<string, SiteAdapter>> {
  const raw = await browser.storage.local.get(STORAGE_KEY);
  const value = raw[STORAGE_KEY];
  if (!value || typeof value !== "object") return {};
  return value as Record<string, SiteAdapter>;
}

export async function writeCachedAdapter(adapter: SiteAdapter): Promise<void> {
  const all = await readCachedAdapters();
  all[adapter.site] = adapter;
  await browser.storage.local.set({ [STORAGE_KEY]: all });
}

/** Cache → bundled fallback. */
export async function resolveAdapter(site: string): Promise<SiteAdapter | null> {
  const cached = (await readCachedAdapters())[site];
  if (cached && typeof cached.version === "number" && cached.selectors) {
    return cached;
  }
  return bundledAdapter(site);
}

export function queryBySelector(
  selector: string | undefined,
  root: ParentNode = document,
): HTMLElement | null {
  if (!selector) return null;
  try {
    return root.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

export function missingSelectorKeys(
  adapter: SiteAdapter,
  root: ParentNode = document,
  keys: string[] = ["prompt_box", "send_button"],
): string[] {
  return keys.filter((k) => !queryBySelector(adapter.selectors[k], root));
}
