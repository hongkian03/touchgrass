import { score } from "./score";
import type { Platform, UsageRow } from "./types";
import { localDateKey } from "./score";

/** Count consecutive local days ending today with score >= 60. */
export function computeStreak(
  rows: UsageRow[],
  today: Date,
  platforms: Platform[],
): number {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dayScore = score(rows, d, platforms);
    const key = localDateKey(d);
    const hasRows = rows.some(
      (r) => localDateKey(new Date(r.ts)) === key,
    );
    if (!hasRows && i > 0) break;
    if (dayScore >= 60) streak += 1;
    else break;
  }
  return streak;
}
