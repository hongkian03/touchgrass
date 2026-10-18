import { localDateKey } from "./score";
import type { DayTotals } from "./totals";
import type { UsageRow } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days of history inside a window: from the first recorded prompt (any time)
 * to today, inclusive, capped at the window. 0 when there's no history.
 */
export function coveredDays(
  rows: UsageRow[],
  today: Date,
  windowDays: number,
): number {
  if (rows.length === 0) return 0;
  const first = rows.reduce(
    (min, r) => Math.min(min, +new Date(r.ts)),
    Number.POSITIVE_INFINITY,
  );
  const start = new Date(localDateKey(new Date(first)) + "T00:00:00");
  const end = new Date(localDateKey(today) + "T00:00:00");
  const days = Math.round((+end - +start) / DAY_MS) + 1;
  return Math.max(1, Math.min(windowDays, days));
}

export type Projected<T> = T & {
  /** True when scaled up from fewer days than the window. */
  projected: boolean;
  /** Days of real history the numbers are based on. */
  basisDays: number;
};

/**
 * Scale a window's totals to the full window from the daily average so far:
 * total ÷ covered days × window days. With a full window of history it's the
 * actual total (factor 1).
 */
export function projectTotals<T extends DayTotals>(
  totals: T,
  rows: UsageRow[],
  today: Date,
  windowDays: number,
): Projected<T> {
  const basisDays = coveredDays(rows, today, windowDays);
  if (basisDays === 0 || basisDays >= windowDays) {
    return { ...totals, projected: false, basisDays };
  }
  const factor = windowDays / basisDays;
  return {
    ...totals,
    Wh: totals.Wh * factor,
    water_L: totals.water_L * factor,
    co2_g: totals.co2_g * factor,
    projected: true,
    basisDays,
  };
}
