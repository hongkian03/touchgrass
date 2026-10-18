import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AchievementReportModal } from "../../components/AchievementReportModal";
import {
  Co2Cloud,
  EnergyBolt,
  TreeGrove,
  WaterDrop,
} from "../../components/FootprintCartoons";
import { InlineOnboarding } from "../../components/InlineOnboarding";
import { MorphNav, GearIcon, type MorphTab } from "../../components/MorphNav";
import { Pip } from "../../components/Pip";
import { CountUp, ScoreCountUp } from "../../components/ScoreCountUp";
import { PlatformsPane, SettingsPane } from "../../components/SettingsPane";
import { StreakFlame } from "../../components/StreakFlame";
import { Button } from "../../components/ui/button";
import coachCopy from "../../data/coach-copy.json";
import footprintData from "../../data/footprint.json";
import insights from "../../data/insights.json";
import platformsData from "../../data/platforms.json";
import usageSeed from "../../data/usage-seed.json";
import { bgBackend } from "../../lib/backendBridge";
import { classify } from "../../lib/classify";
import { POPUP_HEIGHT, POPUP_WIDTH } from "../../lib/layout";
import type { ReportCardData } from "../../lib/reportCard";
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
type Screen =
  | "home"
  | "insights"
  | "settings"
  | "settings-platforms"
  | "report";
type InsightCard = { id: string; text: string };

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
  const [chalkTips, setChalkTips] = useState<InsightCard[]>([]);

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
          setState(s);
          setReady(true);
          return;
        }
        const today = new Date();
        const usage =
          s.usage.length > 0 ? s.usage : (usageSeed as UsageRow[]);
        setState({
          ...s,
          onboarded: true,
          usage,
          score: score(usage, today, platforms),
          streak: computeStreak(usage, today, platforms),
        });
        setReady(true);
      } catch {
        setState(DEFAULT_STATE);
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!state.onboarded) return;
    void (async () => {
      try {
        const res = await bgBackend<{
          ok?: boolean;
          cards?: InsightCard[];
        }>("coaching-insights");
        if (res?.ok && Array.isArray(res.cards) && res.cards.length) {
          setChalkTips(res.cards);
        }
      } catch {
        // local usage cards only
      }
    })();
  }, [state.onboarded]);

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
  const smallPct = Math.round((small / n) * 100);
  const tip =
    slice.length === 0
      ? (insights[0]?.text ?? coachCopy.oversized)
      : `${smallPct}% of your prompts were simple questions a small model could answer.`;

  const reportData: ReportCardData = useMemo(() => {
    const names = state.enabledPlatforms.map((id) => {
      const p = platforms.find((x) => x.id === id);
      if (p) return p.name;
      if (id.startsWith("custom:")) return id.slice("custom:".length);
      return id;
    });
    return {
      userName: state.userName,
      score: state.score,
      streak: state.streak,
      trees,
      smallPct,
      energyWh: totals.Wh,
      waterL: totals.water_L,
      co2g: totals.co2_g,
      platforms: names,
      dateLabel: today.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    };
  }, [
    state.userName,
    state.score,
    state.streak,
    state.enabledPlatforms,
    trees,
    smallPct,
    totals.Wh,
    totals.water_L,
    totals.co2_g,
    today,
  ]);

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

  if (!state.onboarded) {
    return (
      <main
        data-testid="popup"
        data-screen="onboarding"
        className="relative box-border flex flex-col items-stretch gap-2.5 overflow-hidden bg-white p-4 font-sans text-foreground"
        style={shell}
      >
        <InlineOnboarding
          onComplete={(next) => {
            setState(next);
            setScreen("home");
          }}
        />
      </main>
    );
  }

  const morphActive: MorphTab =
    screen === "settings" ||
    screen === "settings-platforms" ||
    screen === "report"
      ? "settings"
      : "insights";

  const showMorphHeader =
    screen === "insights" ||
    screen === "settings" ||
    screen === "settings-platforms";

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
          <ScoreHero
            score={state.score}
            streak={state.streak}
            userName={state.userName}
          />

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
            className="m-0 text-sm leading-snug text-foreground"
          >
            <CoachTipText text={tip} />
          </p>

          <div className="mt-auto flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              data-testid="home-settings"
              aria-label="Settings"
              className="ui-btn-press inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f4f4f5] text-foreground transition-colors hover:bg-[#eef1f4]"
              onClick={() => setScreen("settings")}
            >
              <GearIcon size={24} active />
            </button>
            <SplitButton
              testId="view-more"
              onClick={() => setScreen("insights")}
            >
              View more
            </SplitButton>
          </div>
        </>
      ) : showMorphHeader ? (
        <>
          {screen !== "settings-platforms" ? (
            <div className="flex items-center justify-between gap-2">
              <MorphNav
                active={morphActive}
                onChange={(tab) =>
                  setScreen(tab === "insights" ? "insights" : "settings")
                }
              />
              <SplitButton
                testId="insights-back"
                variant="secondary"
                flip
                onClick={() => setScreen("home")}
              >
                Back
              </SplitButton>
            </div>
          ) : null}

          {screen === "insights" ? (
            <>
              <PeriodSwitch period={period} onChange={setPeriod} />
              <PeriodMeta period={period} days={totals.days} />

              <ul
                data-testid="more-insights"
                className="m-0 flex list-none flex-col gap-2 p-0"
              >
                {chalkTips.map((tipCard, noteIdx) => (
                  <CoachNoteCard
                    key={tipCard.id}
                    index={noteIdx}
                    testId={`insight-${tipCard.id}`}
                    badge="chalk"
                    wash="#e7f6ff"
                    accent="#2ba4e0"
                    icon={<MixBubble size={36} />}
                    text={tipCard.text}
                  />
                ))}
                {insights.map((i, noteIdx) => {
                  const index = chalkTips.length + noteIdx;
                  if (i.id === "small-enough") {
                    return (
                      <CoachNoteCard
                        key={i.id}
                        index={index}
                        testId={`insight-${i.id}`}
                        badge={`${smallPct}%`}
                        wash="#e8f6df"
                        accent="#5cb85c"
                        icon={<MiniModel size={36} />}
                        text="of your prompts were simple questions a small model could answer."
                      />
                    );
                  }
                  if (i.id === "regenerates") {
                    return (
                      <CoachNoteCard
                        key={i.id}
                        index={index}
                        testId={`insight-${i.id}`}
                        badge={`${regen}×`}
                        wash="#fff8dc"
                        accent="#f5c400"
                        icon={<RegenSpin size={36} />}
                        text={
                          regen === 0
                            ? "No regenerates in this range."
                            : regen === 1
                              ? "answer regenerated in this range."
                              : "answers regenerated in this range."
                        }
                      />
                    );
                  }
                  if (i.id === "video-vs-text") {
                    return (
                      <CoachNoteCard
                        key={i.id}
                        index={index}
                        testId={`insight-${i.id}`}
                        badge={videos > 0 ? `${videos}×` : "100×"}
                        wash="#eef1f4"
                        accent="#8e99a4"
                        icon={<MixClapper size={36} />}
                        text={
                          videos === 0
                            ? "One AI video uses about as much energy as hundreds of text prompts."
                            : videos === 1
                              ? "video job in this range. One clip uses about as much energy as hundreds of text prompts."
                              : "video jobs in this range. One clip uses about as much energy as hundreds of text prompts."
                        }
                      />
                    );
                  }
                  return (
                    <CoachNoteCard
                      key={i.id}
                      index={index}
                      testId={`insight-${i.id}`}
                      badge="tip"
                      wash="#f4f4f5"
                      accent="#1b4965"
                      icon={<MixBubble size={36} />}
                      text={i.text}
                    />
                  );
                })}
                {images > 0 ? (
                  <CoachNoteCard
                    key="image-jobs"
                    index={chalkTips.length + insights.length}
                    badge={String(images)}
                    wash="#e7f6ff"
                    accent="#2ba4e0"
                    icon={<MixFrame size={36} />}
                    text={
                      images === 1
                        ? "image job. Those cost more than text."
                        : "image jobs. Those cost more than text."
                    }
                  />
                ) : null}
              </ul>
            </>
          ) : null}

          {screen === "settings" ? (
            <SettingsPane
              state={state}
              onStateChange={setState}
              onOpenPlatforms={() => setScreen("settings-platforms")}
              onGenerateReport={() => setScreen("report")}
            />
          ) : null}

          {screen === "settings-platforms" ? (
            <PlatformsPane
              state={state}
              onStateChange={setState}
              onBack={() => setScreen("settings")}
            />
          ) : null}
        </>
      ) : null}

      {screen === "report" ? (
        <AchievementReportModal
          data={reportData}
          onClose={() => setScreen("settings")}
        />
      ) : null}
    </main>
  );
}

function ScoreHero({
  score: val,
  streak,
  userName,
}: {
  score: number;
  streak: number;
  userName: string;
}) {
  const clamped = Math.max(0, Math.min(100, val));
  const turf =
    clamped >= 70 ? "#5cb85c" : clamped >= 45 ? "#7ec850" : "#b8a868";
  const blade =
    clamped >= 70 ? "#3d8b40" : clamped >= 45 ? "#5cb85c" : "#8d8453";
  const bladeLight =
    clamped >= 70 ? "#8fd18f" : clamped >= 45 ? "#a7df7c" : "#cfc48a";
  const wash =
    clamped >= 70 ? "#e8f6df" : clamped >= 45 ? "#f1f9e8" : "#f5f4ea";

  const blades = [18, 38, 60, 84, 108, 134, 158, 184, 210, 236, 262, 288, 306];
  const greet = userName.trim()
    ? clamped >= 70
      ? `${userName.trim()}'s lush lawn`
      : clamped >= 45
        ? `${userName.trim()}'s fresh lawn`
        : `${userName.trim()} · dry lawn`
    : clamped >= 70
      ? "lush touchgrass score"
      : clamped >= 45
        ? "fresh touchgrass score"
        : "dry lawn. touch grass";

  return (
    <div
      className="relative flex items-center justify-between gap-2 overflow-hidden rounded-2xl px-3 py-2"
      style={{ background: wash }}
    >
      <svg
        viewBox="0 0 320 40"
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-7 w-full"
        preserveAspectRatio="none"
      >
        <path
          d="M0 34 Q80 26 160 33 T320 31 L320 40 L0 40 Z"
          fill={bladeLight}
          opacity="0.65"
        />
        <path
          d="M0 36 Q95 30 190 35 T320 34 L320 40 L0 40 Z"
          fill={turf}
          opacity="0.45"
        />
        {blades.map((x, idx) => {
          const h = 11 + ((idx * 5) % 9);
          const lean = idx % 2 === 0 ? -4 : 5;
          return (
            <g
              key={x}
              transform={`translate(${x} 38)`}
              className="ft-grass"
              style={{ animationDelay: `${(idx % 5) * 160}ms` }}
            >
              <path
                d={`M0 0 Q${lean} ${-h * 0.55} ${lean * 0.6} ${-h}`}
                fill="none"
                stroke={idx % 3 === 0 ? blade : turf}
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </g>
          );
        })}
        {clamped >= 70 ? (
          <>
            <circle className="ft-leaf" cx="72" cy="26" r="2.2" fill="#f5c400" />
            <circle
              className="ft-leaf ft-spark--late"
              cx="202"
              cy="25"
              r="2"
              fill="#ffffff"
            />
          </>
        ) : null}
      </svg>

      <div className="relative flex items-center gap-2.5">
        <Pip
          size={60}
          variant="sticker"
          pose={clamped >= 80 ? "chill" : clamped >= 60 ? "gotit" : "plant"}
          tilt={-5}
        />
        <div className="leading-none">
          <div className="flex items-baseline gap-1.5">
            <ScoreCountUp
              value={val}
              className="font-sans text-[2.5rem] font-semibold leading-none text-foreground tabular-nums"
            />
            <span className="text-xs font-medium text-muted-foreground">
              / 100
            </span>
          </div>
          <p className="m-0 mt-1 text-xs font-medium text-foreground">
            {greet}
          </p>
        </div>
      </div>

      <div
        className="relative flex items-center gap-1.5 rounded-xl bg-white/90 px-2.5 py-1.5 shadow-sm"
        data-testid="streak"
      >
        <StreakFlame size={28} />
        <div className="leading-tight">
          <div className="text-base font-semibold tabular-nums">{streak}</div>
          <div className="text-[10px] text-muted-foreground">day streak</div>
        </div>
      </div>
    </div>
  );
}

function PeriodSwitch({
  period,
  onChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
}) {
  const idx = Math.max(
    0,
    PERIODS.findIndex((p) => p.id === period),
  );
  return (
    <div
      data-testid="period-switch"
      className="relative flex rounded-full bg-[#f4f4f5] p-1"
      role="tablist"
      aria-label="Range"
    >
      <span
        aria-hidden="true"
        className="ui-period-thumb pointer-events-none absolute inset-y-1 start-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-white shadow-sm"
        style={{ transform: `translateX(calc(${idx} * 100%))` }}
      />
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
              "relative z-10 h-8 flex-1 rounded-full text-sm font-medium transition-colors",
              on ? "text-foreground" : "bg-transparent text-muted-foreground",
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

function CoachTipText({ text }: { text: string }) {
  const m = text.match(/^(\d+%|\d+\s*times)\b/i);
  if (!m) return <>{text}</>;
  const lead = m[1];
  const rest = text.slice(lead.length);
  return (
    <>
      <span className="font-semibold text-foreground">{lead}</span>
      {rest}
    </>
  );
}

function CoachNoteCard({
  testId,
  badge,
  wash,
  accent,
  icon,
  text,
  index = 0,
}: {
  testId?: string;
  badge: string;
  wash: string;
  accent: string;
  icon: ReactNode;
  text: string;
  index?: number;
}) {
  return (
    <li
      data-testid={testId}
      className="ui-note-enter flex list-none items-start gap-2.5 rounded-xl border border-border bg-white px-2.5 py-2"
      style={{ ["--i" as string]: index } as CSSProperties}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        style={{ background: wash }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <span
          className="mb-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground"
          style={{
            background: wash,
            color: accent === "#f5c400" ? "#8a5a00" : accent,
          }}
        >
          {badge}
        </span>
        <p className="m-0 text-xs leading-snug text-foreground">{text}</p>
      </div>
    </li>
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
        <circle
          className="ft-eye ft-eye--late"
          cx="41"
          cy="34"
          r="1.8"
          fill="#2d5a27"
        />
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
      <circle
        className="ft-eye ft-eye--late"
        cx="40"
        cy="34"
        r="1.8"
        fill="#8a5a00"
      />
    </svg>
  );
}

function MixBubble({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="#d6f0ff" />
      <ellipse
        className="ft-cloud"
        cx="36"
        cy="32"
        rx="18"
        ry="14"
        fill="#2ba4e0"
      />
      <path d="M26 42 L22 54 L36 44 Z" fill="#2ba4e0" />
      <circle className="ft-eye" cx="30" cy="30" r="2" fill="#0b4f74" />
      <circle
        className="ft-eye ft-eye--late"
        cx="42"
        cy="30"
        r="2"
        fill="#0b4f74"
      />
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
        "ui-btn-press relative overflow-hidden",
        flip ? "ui-btn-press--flip ps-12" : "pe-12",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      {children}
      <span
        className={[
          "ui-btn-chevron pointer-events-none absolute inset-y-0 flex w-9 items-center justify-center bg-primary-foreground/15",
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
