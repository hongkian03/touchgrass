import { describe, expect, it } from "vitest";
import { coveredDays, projectTotals } from "../lib/projection";
import type { UsageRow } from "../lib/types";

const today = new Date(2026, 9, 18, 15, 0, 0);

function row(daysAgo: number): UsageRow {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  return {
    ts: d.toISOString(),
    provider: "chatgpt",
    model: "gpt-5",
    kind: "text",
    prompt_text: "hi",
    regenerated: false,
  };
}

const totals = { Wh: 1, water_L: 0.001, co2_g: 0.1, days: 1 };

describe("projectTotals", () => {
  it("1 day of history → week ×7, month ×30", () => {
    const rows = [row(0)];
    const w = projectTotals(totals, rows, today, 7);
    const m = projectTotals(totals, rows, today, 30);
    expect(w).toMatchObject({ projected: true, basisDays: 1 });
    expect(w.Wh).toBeCloseTo(7);
    expect(m.Wh).toBeCloseTo(30);
    expect(m.co2_g).toBeCloseTo(3);
  });

  it("history started 2 days ago → ×3.5 for the week (quiet days count)", () => {
    const w = projectTotals(totals, [row(2)], today, 7);
    expect(w.basisDays).toBe(3);
    expect(w.Wh).toBeCloseTo(7 / 3);
  });

  it("a full window of history → actual totals, not projected", () => {
    const w = projectTotals(totals, [row(10)], today, 7);
    expect(w).toMatchObject({ projected: false, basisDays: 7, Wh: 1 });
  });

  it("no history → zeros stay zeros", () => {
    expect(coveredDays([], today, 7)).toBe(0);
    const z = projectTotals({ ...totals, Wh: 0 }, [], today, 30);
    expect(z).toMatchObject({ projected: false, Wh: 0 });
  });
});
