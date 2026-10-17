import { useEffect, useState, type ReactNode } from "react";
import {
  Co2Cloud,
  EnergyBolt,
  TreeGrove,
  WaterDrop,
} from "../../components/FootprintCartoons";
import { CountUp, ScoreCountUp } from "../../components/ScoreCountUp";
import { StreakFlame } from "../../components/StreakFlame";
import { Button } from "../../components/ui/button";
import coachCopy from "../../data/coach-copy.json";
import footprintData from "../../data/footprint.json";
import insights from "../../data/insights.json";
import platformsData from "../../data/platforms.json";
import usageSeed from "../../data/usage-seed.json";
import { classify } from "../../lib/classify";
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
type Screen = "home" | "insights";

const PERIODS: Array<{ id: Period; label: string; testId: string }> = [
  { id: "day", label: "D", testId: "period-day" },
  { id: "week", label: "W", testId: "week" },
  { id: "month", label: "M", testId: "period-month" },
];

export function PopupApp() {
  const [state, setState] = useState<PuddleState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [period, setPeriod] = useState<Period>("day");
  const [screen, setScreen] = useState<Screen>("home");

  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";
    document.body.style.width = `${POPUP_WIDTH}px`;
    document.body.style.height = `${POPUP_HEIGHT}px`;
  }, []);

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
  const windowDays = period === "day" ? 1 : period === "week" ? 7 : 30;
  const inRange = new Set(lastNDays(today, windowDays));
  const slice = state.usage.filter((r) =>
    inRange.has(localDateKey(new Date(r.ts))),
  );
  const n = slice.length || 1;
  const small = slice.filter(
    (r) => classify(r.prompt_text, r.kind) === "small_ok",
  ).length;
  const regen = slice.filter((r) => r.regenerated).length;
  const images = slice.filter((r) => r.kind === "image").length;
  const videos = slice.filter((r) => r.kind === "video").length;
  const texts = slice.filter((r) => r.kind === "text").length;
  const smallPct = Math.round((small / n) * 100);
  const regenPct = Math.round((regen / n) * 100);

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
      data-screen={screen}
      className={[
        "relative box-border flex flex-col items-stretch gap-2.5 bg-white p-4 font-sans text-foreground",
        screen === "home" ? "overflow-hidden" : "overflow-y-auto",
      ].join(" ")}
      style={shell}
    >
      {screen === "home" ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <ScoreCountUp value={state.score} />
              <p className="m-0 mt-1 text-xs text-muted-foreground">score</p>
            </div>
            <div className="flex items-center gap-1.5" data-testid="streak">
              <StreakFlame size={28} />
              <div className="leading-tight">
                <div className="text-lg font-semibold tabular-nums">
                  {state.streak}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  day streak
                </div>
              </div>
            </div>
          </div>

          <PeriodSwitch period={period} onChange={setPeriod} />
          <PeriodMeta period={period} days={totals.days} />

          <div className="grid grid-cols-2 gap-2" data-testid="footprint-ticks">
            <CartoonTick
              label="power used"
              hint="Electricity these prompts burned, in watt-hours."
              value={totals.Wh}
              decimals={1}
              suffix=" Wh"
              testId="tick-energy"
              wash="#fff8dc"
            >
              <EnergyBolt size={56} />
            </CartoonTick>
            <CartoonTick
              label="water used"
              hint="Water used to cool the servers, in liters."
              value={totals.water_L}
              decimals={2}
              suffix=" L"
              testId="tick-water"
              wash="#e7f6ff"
            >
              <WaterDrop size={56} />
            </CartoonTick>
            <CartoonTick
              label="carbon out"
              hint="CO₂ from the power those prompts used, in grams."
              value={totals.co2_g}
              decimals={1}
              suffix=" g"
              testId="tick-co2"
              wash="#eef1f4"
            >
              <Co2Cloud size={56} />
            </CartoonTick>
            <CartoonTick
              label="trees planted"
              hint="Trees equal to the CO₂ you skipped vs the big default model."
              value={trees}
              decimals={1}
              suffix=""
              testId="tick-trees"
              wash="#e8f6df"
            >
              <TreeGrove size={56} count={trees} />
            </CartoonTick>
          </div>

          <p
            data-testid="coach-line"
            className="m-0 line-clamp-2 text-sm leading-snug text-muted-foreground"
          >
            {tip}
          </p>
          <SplitButton
            testId="view-more"
            className="mt-auto ml-auto"
            onClick={() => setScreen("insights")}
          >
            View more
          </SplitButton>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-xl font-semibold tracking-tight">
              Insights
            </h2>
            <SplitButton
              testId="insights-back"
              variant="secondary"
              flip
              onClick={() => setScreen("home")}
            >
              Back
            </SplitButton>
          </div>
          <PeriodSwitch period={period} onChange={setPeriod} />
          <PeriodMeta period={period} days={totals.days} />

          <section data-testid="more-insights" className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <CartoonTick
                label="small model"
                hint="Share of prompts a cheaper model could handle."
                value={smallPct}
                decimals={0}
                suffix="%"
                testId="tick-small"
                wash="#e8f6df"
              >
                <MiniModel size={56} />
              </CartoonTick>
              <CartoonTick
                label="regenerates"
                hint="How often you hit regenerate on the same answer."
                value={regenPct}
                decimals={0}
                suffix="%"
                testId="tick-regen"
                wash="#fff8dc"
              >
                <RegenSpin size={56} />
              </CartoonTick>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <CartoonTick
                label="text"
                hint="Text prompts in this range."
                value={texts}
                decimals={0}
                suffix=""
                testId="tick-text"
                wash="#e7f6ff"
              >
                <MixBubble size={56} />
              </CartoonTick>
              <CartoonTick
                label="image"
                hint="Image jobs in this range."
                value={images}
                decimals={0}
                suffix=""
                testId="tick-image"
                wash="#fff8dc"
              >
                <MixFrame size={56} />
              </CartoonTick>
              <CartoonTick
                label="video"
                hint="Video jobs in this range."
                value={videos}
                decimals={0}
                suffix=""
                testId="tick-video"
                wash="#eef1f4"
              >
                <MixClapper size={56} />
              </CartoonTick>
            </div>
          </section>

          <ul className="m-0 list-none space-y-2 p-0 text-sm leading-snug text-muted-foreground">
            {insights.map((i) => (
              <li
                key={i.id}
                data-testid={`insight-${i.id}`}
                className="rounded-xl bg-[#f4f4f5] px-3 py-2"
              >
                {i.text}
              </li>
            ))}
            {regen > 0 ? (
              <li className="rounded-xl bg-[#fff8dc] px-3 py-2">
                You regenerated {regen}{" "}
                {regen === 1 ? "answer" : "answers"} in this range.
              </li>
            ) : null}
            {images > 0 ? (
              <li className="rounded-xl bg-[#e7f6ff] px-3 py-2">
                {images === 1
                  ? "1 image job. Those cost more than text."
                  : `${images} image jobs. Those cost more than text.`}
              </li>
            ) : null}
            {videos > 0 ? (
              <li className="rounded-xl bg-[#eef1f4] px-3 py-2">
                {videos === 1
                  ? "1 video job. One clip is about hundreds of text prompts."
                  : `${videos} video jobs. One clip is about hundreds of text prompts.`}
              </li>
            ) : null}
          </ul>
        </>
      )}
    </main>
  );
}

function PeriodSwitch({
  period,
  onChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
}) {
  return (
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
            onClick={() => onChange(p.id)}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function PeriodMeta({ period, days }: { period: Period; days: number }) {
  return (
    <p className="m-0 text-xs text-muted-foreground" data-testid="period-meta">
      {period === "day"
        ? "Today"
        : period === "week"
          ? `${days} days this week`
          : `${days} days this month`}
    </p>
  );
}

function MiniModel({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="#d8f0c8" />
      <rect x="17" y="27" width="7" height="4.2" rx="1.2" fill="#3d8b40" />
      <rect x="17" y="34" width="7" height="4.2" rx="1.2" fill="#3d8b40" />
      <rect x="17" y="41" width="7" height="4.2" rx="1.2" fill="#3d8b40" />
      <rect x="48" y="27" width="7" height="4.2" rx="1.2" fill="#3d8b40" />
      <rect x="48" y="34" width="7" height="4.2" rx="1.2" fill="#3d8b40" />
      <rect x="48" y="41" width="7" height="4.2" rx="1.2" fill="#3d8b40" />
      <g className="ft-drop">
        <rect x="24" y="22" width="24" height="28" rx="6" fill="#5cb85c" />
        <ellipse cx="30" cy="30" rx="4" ry="5" fill="#8fd18f" opacity="0.95" />
        <circle className="ft-eye" cx="31" cy="34" r="1.8" fill="#2d5a27" />
        <circle className="ft-eye ft-eye--late" cx="41" cy="34" r="1.8" fill="#2d5a27" />
        <path
          d="M31 42 Q36 45 42 41"
          fill="none"
          stroke="#2d5a27"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

function RegenSpin({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="#fff3c4" />
      <circle cx="36" cy="36" r="16" fill="#f5c400" opacity="0.35" />
      <path
        className="ft-orbit"
        d="M36 18 A18 18 0 1 1 20 42"
        fill="none"
        stroke="#f5c400"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M18 36 L20 44 L28 40"
        fill="none"
        stroke="#8a5a00"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle className="ft-eye" cx="30" cy="34" r="1.8" fill="#8a5a00" />
      <circle className="ft-eye ft-eye--late" cx="40" cy="34" r="1.8" fill="#8a5a00" />
    </svg>
  );
}

function MixBubble({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="#d6f0ff" />
      <ellipse className="ft-cloud" cx="36" cy="32" rx="18" ry="14" fill="#2ba4e0" />
      <path d="M26 42 L22 54 L36 44 Z" fill="#2ba4e0" />
      <circle className="ft-eye" cx="30" cy="30" r="2" fill="#0b4f74" />
      <circle className="ft-eye ft-eye--late" cx="42" cy="30" r="2" fill="#0b4f74" />
      <path
        d="M30 38 Q36 42 42 37"
        fill="none"
        stroke="#0b4f74"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MixFrame({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="#fff3c4" />
      <rect
        className="ft-bolt"
        x="16"
        y="20"
        width="40"
        height="30"
        rx="5"
        fill="#f5c400"
      />
      <circle cx="28" cy="32" r="5" fill="#fff8dc" />
      <path
        d="M20 50 L30 38 L38 44 L52 30 L56 50 Z"
        fill="#8a5a00"
        opacity="0.35"
      />
    </svg>
  );
}

function MixClapper({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="#eef1f4" />
      <rect
        className="ft-drop"
        x="18"
        y="30"
        width="36"
        height="22"
        rx="3"
        fill="#8e99a4"
      />
      <path d="M18 30 L28 18 L54 18 L44 30 Z" fill="#4a5560" opacity="0.7" />
      <rect x="22" y="38" width="10" height="3" rx="1.5" fill="#eef1f4" />
      <rect x="36" y="38" width="14" height="3" rx="1.5" fill="#eef1f4" />
    </svg>
  );
}

function SplitButton({
  children,
  onClick,
  testId,
  className,
  variant = "default",
  flip = false,
}: {
  children: ReactNode;
  onClick: () => void;
  testId: string;
  className?: string;
  variant?: "default" | "secondary";
  flip?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={variant}
      data-testid={testId}
      className={[
        "relative overflow-hidden",
        flip ? "ps-12" : "pe-12",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      {children}
      <span
        className={[
          "pointer-events-none absolute inset-y-0 flex w-9 items-center justify-center bg-primary-foreground/15",
          flip ? "start-0" : "end-0",
        ].join(" ")}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
          className={flip ? "rotate-180 opacity-60" : "opacity-60"}
        >
          <path
            d="M6 3 L11 8 L6 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </Button>
  );
}

function CartoonTick({
  label,
  hint,
  value,
  decimals,
  suffix,
  testId,
  wash,
  children,
}: {
  label: string;
  hint: string;
  value: number;
  decimals: number;
  suffix: string;
  testId: string;
  wash: string;
  children: ReactNode;
}) {
  return (
    <div
      title={hint}
      className="flex cursor-help flex-col items-center rounded-xl px-2 py-2 text-center"
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
