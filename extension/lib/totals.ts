import type { UsageRow } from "./types";
import { localDateKey } from "./score";

export type FootprintModel = {
  Wh: number;
  water_L: number;
  co2_g: number;
};

export type DayTotals = {
  Wh: number;
  water_L: number;
  co2_g: number;
};

export function dayTotals(
  rows: UsageRow[],
  today: Date,
  models: Record<string, FootprintModel>,
): DayTotals {
  const key = localDateKey(today);
  let Wh = 0;
  let water_L = 0;
  let co2_g = 0;
  for (const row of rows) {
    if (localDateKey(new Date(row.ts)) !== key) continue;
    const m = models[row.model];
    if (!m) continue;
    Wh += m.Wh;
    water_L += m.water_L;
    co2_g += m.co2_g;
  }
  return { Wh, water_L, co2_g };
}
