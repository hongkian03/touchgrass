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

          <section data-testid="more-insights" className="flex flex-col gap-2.5">
            <PuddleMeter
              label="small-model asks"
              hint="Share of prompts a cheaper model could handle."
              value={smallPct}
              wash="#e8f6df"
              accent="#5cb85c"
              glyph="leaf"
            />
            <PuddleMeter
              label="regenerates"
              hint="How often you hit regenerate on the same answer."
              value={regenPct}
              wash="#fff8dc"
              accent="#f5c400"
              glyph="spin"
            />
            <PromptMix text={texts} image={images} video={videos} />
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

function PuddleMeter({
  label,
  hint,
  value,
  wash,
  accent,
  glyph,
}: {
  label: string;
  hint: string;
  value: number;
  wash: string;
  accent: string;
  glyph: "leaf" | "spin";
}) {
  const pct = Math.max(0, Math.min(100, value));
  const beads = 10;
  const lit = Math.round((pct / 100) * beads);
  return (
    <div
      title={hint}
      className="cursor-help rounded-xl px-3 py-2.5"
      style={{ background: wash }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MeterGlyph kind={glyph} color={accent} />
          <span className="text-xs font-medium text-foreground">{label}</span>
        </div>
        <span className="text-sm font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: beads }, (_, i) => (
          <span
            key={i}
            className="insight-bead h-3.5 flex-1 rounded-full"
            style={{
              background: i < lit ? accent : "rgba(27, 73, 101, 0.1)",
              transform: i < lit ? "scaleY(1)" : "scaleY(0.55)",
              opacity: i < lit ? 1 : 0.55,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function MeterGlyph({
  kind,
  color,
}: {
  kind: "leaf" | "spin";
  color: string;
}) {
  if (kind === "leaf") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <ellipse
          className="ft-sway"
          cx="12"
          cy="13"
          rx="7"
          ry="9"
          fill={color}
          opacity="0.9"
        />
        <path
          d="M12 6 C12 12 12 18 12 20"
          fill="none"
          stroke="#1b4965"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.45"
        />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill={color} opacity="0.35" />
      <path
        className="ft-orbit"
        d="M12 5 A7 7 0 1 1 5.5 14"
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M5 11 L5.5 14.5 L8.5 13"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PromptMix({
  text,
  image,
  video,
}: {
  text: number;
  image: number;
  video: number;
}) {
  const total = text + image + video;
  const share = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const cols = [
    {
      key: "text",
      count: text,
      pct: share(text),
      label: "text",
      wash: "#e7f6ff",
      accent: "#2ba4e0",
      art: <MixBubble />,
    },
    {
      key: "image",
      count: image,
      pct: share(image),
      label: "image",
      wash: "#fff8dc",
      accent: "#f5c400",
      art: <MixFrame />,
    },
    {
      key: "video",
      count: video,
      pct: share(video),
      label: "video",
      wash: "#eef1f4",
      accent: "#8e99a4",
      art: <MixClapper />,
    },
  ] as const;

  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-foreground">
        prompt mix
      </div>
      <div className="grid grid-cols-3 gap-2">
        {cols.map((c) => (
          <div
            key={c.key}
            className="flex flex-col items-center rounded-xl px-1.5 py-2 text-center"
            style={{ background: c.wash }}
          >
            {c.art}
            <div
              className="mt-1.5 flex h-14 w-5 items-end overflow-hidden rounded-full bg-white/70"
              aria-hidden="true"
            >
              <div
                className="insight-fill w-full rounded-full"
                style={{
                  height: `${Math.max(c.pct, c.count > 0 ? 12 : 0)}%`,
                  background: c.accent,
                }}
              />
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums">
              {c.count}
            </div>
            <div className="text-[10px] text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MixBubble() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <ellipse className="ft-puff" cx="15" cy="14" rx="11" ry="9" fill="#2ba4e0" />
      <path d="M10 20 L8 26 L15 21 Z" fill="#2ba4e0" />
      <circle className="ft-eye" cx="12" cy="13" r="1.4" fill="#1b4965" />
      <circle className="ft-eye ft-eye--late" cx="18" cy="13" r="1.4" fill="#1b4965" />
    </svg>
  );
}

function MixFrame() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect
        className="ft-zap"
        x="5"
        y="7"
        width="22"
        height="18"
        rx="3"
        fill="#f5c400"
      />
      <circle cx="12" cy="14" r="3" fill="#fff8dc" />
      <path d="M8 22 L14 16 L18 19 L24 13 L24 22 Z" fill="#1b4965" opacity="0.35" />
    </svg>
  );
}

function MixClapper() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect
        className="ft-bounce"
        x="6"
        y="12"
        width="20"
        height="12"
        rx="2"
        fill="#8e99a4"
      />
      <path d="M6 12 L12 6 L26 6 L20 12 Z" fill="#1b4965" opacity="0.55" />
      <rect x="8" y="16" width="6" height="2" rx="1" fill="#eef1f4" />
      <rect x="16" y="16" width="8" height="2" rx="1" fill="#eef1f4" />
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
