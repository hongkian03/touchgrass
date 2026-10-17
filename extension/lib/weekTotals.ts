import type { UsageRow } from "./types";
import { weekWindow, localDateKey } from "./score";
import type { DayTotals, FootprintModel } from "./totals";

export function weekTotals(
  rows: UsageRow[],
  today: Date,
  models: Record<string, FootprintModel>,
): DayTotals & { days: number } {
  const keys = new Set(weekWindow(today));
  let Wh = 0;
  let water_L = 0;
  let co2_g = 0;
  const daysHit = new Set<string>();
  for (const row of rows) {
    const key = localDateKey(new Date(row.ts));
    if (!keys.has(key)) continue;
    daysHit.add(key);
    const m = models[row.model];
    if (!m) continue;
    Wh += m.Wh;
    water_L += m.water_L;
    co2_g += m.co2_g;
  }
  return { Wh, water_L, co2_g, days: daysHit.size };
}
