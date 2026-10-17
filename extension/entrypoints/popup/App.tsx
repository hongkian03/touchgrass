import { useEffect, useState, type ReactNode } from "react";
import {
  Co2Cloud,
  EnergyBolt,
  TreeGrove,
  WaterDrop,
} from "../../components/FootprintCartoons";
import { CountUp, ScoreCountUp } from "../../components/ScoreCountUp";
import { StreakFlame } from "../../components/StreakFlame";
import coachCopy from "../../data/coach-copy.json";
import footprintData from "../../data/footprint.json";
import insights from "../../data/insights.json";
import platformsData from "../../data/platforms.json";
import usageSeed from "../../data/usage-seed.json";
import { POPUP_HEIGHT, POPUP_WIDTH } from "../../lib/layout";
import {
  daySavings,
  monthSavings,
  saplingsFromCo2G,
  weekSavings,
} from "../../lib/savings";
import { lastNDays, localDateKey, score } from "../../lib/score";
import { DEFAULT_STATE, readState, type PuddleState } from "../../lib/storage";
import { computeStreak } from "../../lib/streak";
import { dayTotals, type FootprintModel } from "../../lib/totals";
import { monthTotals, weekTotals } from "../../lib/weekTotals";
import type { Platform, UsageRow } from "../../lib/types";

const platforms = platformsData as Platform[];
const models = (footprintData as { models: Record<string, FootprintModel> })
  .models;

type Period = "day" | "week" | "month";

const PERIODS: Array<{ id: Period; label: string; testId: string }> = [
  { id: "day", label: "D", testId: "period-day" },
  { id: "week", label: "W", testId: "week" },
  { id: "month", label: "M", testId: "period-month" },
];

export function PopupApp() {
  const [state, setState] = useState<PuddleState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [period, setPeriod] = useState<Period>("day");
  const [more, setMore] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const s = await readState();
        if (!s.onboarded) {
          await browser.tabs.create({
            url: browser.runtime.getURL("/onboarding.html"),
          });
          window.close();
          return;
        }
        const today = new Date();
        setState({
          ...s,
          score: score(s.usage, today, platforms),
          streak: computeStreak(s.usage, today, platforms),
        });
        setReady(true);
      } catch {
        const usage = usageSeed as UsageRow[];
        const today = new Date();
        setState({
          ...DEFAULT_STATE,
          onboarded: true,
          usage,
          score: score(usage, today, platforms),
          streak: computeStreak(usage, today, platforms),
        });
        setReady(true);
      }
    })();
  }, []);

  const today = new Date();
  const byPeriod = {
    day: {
      totals: { ...dayTotals(state.usage, today, models), days: 1 },
      trees: saplingsFromCo2G(
        daySavings(state.usage, today, platforms, models).co2_g,
      ),
    },
    week: {
      totals: weekTotals(state.usage, today, models),
      trees: saplingsFromCo2G(
        weekSavings(state.usage, today, platforms, models).co2_g,
      ),
    },
    month: {
      totals: monthTotals(state.usage, today, models),
      trees: saplingsFromCo2G(
        monthSavings(state.usage, today, platforms, models).co2_g,
      ),
    },
  };
  const { totals, trees } = byPeriod[period];
  const tip = insights[0]?.text ?? coachCopy.oversized;
  const extraInsights = insights.slice(1).map((i) => i.text);
  const windowDays = period === "day" ? 1 : period === "week" ? 7 : 30;
  const inRange = new Set(lastNDays(today, windowDays));
  const slice = state.usage.filter((r) =>
    inRange.has(localDateKey(new Date(r.ts))),
  );
  const regen = slice.filter((r) => r.regenerated).length;
  const images = slice.filter((r) => r.kind === "image").length;
  const videos = slice.filter((r) => r.kind === "video").length;
  const habits = [
    regen > 0 ? `You regenerated ${regen} answers in this range.` : null,
    images > 0 ? `${images} image jobs — those cost more than text.` : null,
    videos > 0 ? `${videos} video jobs. One clip ≈ hundreds of text prompts.` : null,
    coachCopy.regenerate,
  ].filter((x): x is string => Boolean(x));

  const shell = {
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
  } as const;

  if (!ready) {
    return (
      <div
        data-testid="popup"
        className="box-border flex flex-col items-center gap-3 bg-white p-5 font-sans text-foreground"
        style={shell}
      />
    );
  }

  return (
    <main
      data-testid="popup"
      data-period={period}
      className="relative box-border flex flex-col items-stretch gap-3 overflow-y-auto bg-white p-5 font-sans text-foreground"
      style={shell}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <ScoreCountUp value={state.score} />
          <p className="m-0 mt-1 text-xs text-muted-foreground">score</p>
        </div>
        <div
          className="flex items-center gap-1.5"
          data-testid="streak"
        >
          <StreakFlame size={28} />
          <div className="leading-tight">
            <div className="text-lg font-semibold tabular-nums">
              {state.streak}
            </div>
            <div className="text-[11px] text-muted-foreground">day streak</div>
          </div>
        </div>
      </div>

      <div
        data-testid="period-switch"
        className="flex rounded-full bg-[#f4f4f5] p-1"
        role="tablist"
        aria-label="Range"
      >
        {PERIODS.map((p) => {
          const on = period === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={on}
              data-testid={p.testId}
              className={[
                "h-8 flex-1 rounded-full text-sm font-medium transition-colors",
                on
                  ? "bg-white text-foreground shadow-sm"
                  : "bg-transparent text-muted-foreground",
              ].join(" ")}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <p className="m-0 text-xs text-muted-foreground" data-testid="period-meta">
        {period === "day"
          ? "Today"
          : period === "week"
            ? `${totals.days} days this week`
            : `${totals.days} days this month`}
      </p>

      <div
        className="grid grid-cols-2 gap-2"
        data-testid="footprint-ticks"
      >
        <CartoonTick
          label="energy"
          value={totals.Wh}
          decimals={1}
          suffix=" Wh"
          testId="tick-energy"
          wash="#fff8dc"
        >
          <EnergyBolt size={64} />
        </CartoonTick>
        <CartoonTick
          label="water"
          value={totals.water_L}
          decimals={2}
          suffix=" L"
          testId="tick-water"
          wash="#e7f6ff"
        >
          <WaterDrop size={64} />
        </CartoonTick>
        <CartoonTick
          label="CO₂"
          value={totals.co2_g}
          decimals={1}
          suffix=" g"
          testId="tick-co2"
          wash="#eef1f4"
        >
          <Co2Cloud size={64} />
        </CartoonTick>
        <CartoonTick
          label="trees planted"
          value={trees}
          decimals={1}
          suffix=""
          testId="tick-trees"
          wash="#e8f6df"
        >
          <TreeGrove size={64} count={trees} />
        </CartoonTick>
      </div>

      <p
        data-testid="coach-line"
        className="m-0 text-sm leading-snug text-muted-foreground"
      >
        {tip}
      </p>
      {more ? (
        <ul
          data-testid="more-insights"
          className="m-0 list-none space-y-2 p-0 text-sm leading-snug text-muted-foreground"
        >
          {[...extraInsights, ...habits].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        data-testid="view-more"
        className="mt-auto ml-auto inline-flex items-center gap-1 text-sm font-medium text-foreground"
        onClick={() => setMore((v) => !v)}
      >
        {more ? "Show less" : "View more"}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          aria-hidden="true"
          className={more ? "-rotate-90" : "rotate-0"}
        >
          <path
            d="M5 3 L9 7 L5 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </main>
  );
}

function CartoonTick({
  label,
  value,
  decimals,
  suffix,
  testId,
  wash,
  children,
}: {
  label: string;
  value: number;
  decimals: number;
  suffix: string;
  testId: string;
  wash: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center rounded-xl px-2 py-2 text-center"
      style={{ background: wash }}
    >
      {children}
      <CountUp
        key={`${testId}-${value}`}
        value={value}
        decimals={decimals}
        suffix={suffix}
        durationMs={700}
        data-testid={testId}
        className="mt-1 block text-sm tabular-nums"
      />
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
