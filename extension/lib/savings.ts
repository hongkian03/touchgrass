import { localDateKey, monthWindow, weekWindow } from "./score";
import type { DayTotals, FootprintModel } from "./totals";
import type { Platform, UsageRow } from "./types";

function zero(): DayTotals {
  return { Wh: 0, water_L: 0, co2_g: 0 };
}

function defaultModelFor(
  provider: string,
  platforms: Platform[],
): string | undefined {
  return platforms.find((p) => p.id === provider)?.defaultModel;
}

function addSaved(
  acc: DayTotals,
  baseline: FootprintModel,
  actual: FootprintModel,
): void {
  acc.Wh += Math.max(0, baseline.Wh - actual.Wh);
  acc.water_L += Math.max(0, baseline.water_L - actual.water_L);
  acc.co2_g += Math.max(0, baseline.co2_g - actual.co2_g);
}

function savingsForKeys(
  rows: UsageRow[],
  keys: Set<string>,
  platforms: Platform[],
  models: Record<string, FootprintModel>,
): DayTotals {
  const acc = zero();
  for (const row of rows) {
    if (!keys.has(localDateKey(new Date(row.ts)))) continue;
    const actual = models[row.model];
    const bigId = defaultModelFor(row.provider, platforms) ?? row.model;
    const baseline = models[bigId];
    if (!actual || !baseline) continue;
    addSaved(acc, baseline, actual);
  }
  return acc;
}

export function daySavings(
  rows: UsageRow[],
  today: Date,
  platforms: Platform[],
  models: Record<string, FootprintModel>,
): DayTotals {
  return savingsForKeys(
    rows,
    new Set([localDateKey(today)]),
    platforms,
    models,
  );
}

export function weekSavings(
  rows: UsageRow[],
  today: Date,
  platforms: Platform[],
  models: Record<string, FootprintModel>,
): DayTotals {
  return savingsForKeys(
    rows,
    new Set(weekWindow(today)),
    platforms,
    models,
  );
}

export function monthSavings(
  rows: UsageRow[],
  today: Date,
  platforms: Platform[],
  models: Record<string, FootprintModel>,
): DayTotals {
  return savingsForKeys(
    rows,
    new Set(monthWindow(today)),
    platforms,
    models,
  );
}
