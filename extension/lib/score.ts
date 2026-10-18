import { classify } from "./classify";
import type { Platform, UsageRow } from "./types";

/** Local YYYY-MM-DD for a Date. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Last `n` local calendar dates ending at `now` (inclusive). */
export function lastNDays(now: Date, n: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(localDateKey(d));
  }
  return keys;
}

/** Last 7 local calendar dates ending at `now` (inclusive). */
export function weekWindow(now: Date): string[] {
  return lastNDays(now, 7);
}

/** Last 30 local calendar dates — Health-style “Month”. */
export function monthWindow(now: Date): string[] {
  return lastNDays(now, 30);
}

function smallModelFor(
  provider: string,
  platforms: Platform[],
): string | undefined {
  return platforms.find((p) => p.id === provider)?.smallModel;
}

/**
 * Waste for rows on a single local calendar day.
 * Weights (also hardcoded in tests per issue #3): oversized +15, regen +5, image +25, video +40.
 * These are team-chosen coaching weights, not measurements; the footprint numbers live in footprint.ts.
 */
export function wastePenalty(
  rows: UsageRow[],
  today: Date,
  platforms: Platform[],
): number {
  const key = localDateKey(today);
  let penalty = 0;
  for (const row of rows) {
    const rowDay = localDateKey(new Date(row.ts));
    if (rowDay !== key) continue;

    if (row.kind === "image") penalty += 25;
    if (row.kind === "video") penalty += 40;

    if (row.regenerated) penalty += 5;

    if (row.kind === "text") {
      const cls = classify(row.prompt_text, row.kind);
      const small = smallModelFor(row.provider, platforms);
      if (cls === "small_ok" && small && row.model !== small) {
        penalty += 15;
      }
    }
  }
  return Math.min(100, penalty);
}

export function score(
  rows: UsageRow[],
  today: Date,
  platforms: Platform[],
): number {
  return 100 - wastePenalty(rows, today, platforms);
}
