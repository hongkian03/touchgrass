import type { Platform } from "./types";

/** Origins to request for the selected platform ids. */
export function hostsForPlatforms(
  selectedIds: string[],
  platforms: Platform[],
): string[] {
  const set = new Set<string>();
  for (const id of selectedIds) {
    const p = platforms.find((x) => x.id === id);
    if (!p) continue;
    for (const h of p.hosts) set.add(h);
  }
  return [...set];
}

export function canContinueOnboarding(selectedCount: number): boolean {
  return selectedCount >= 1;
}
