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
import {
  InkDefs,
  PAPER,
  ROUGH,
  ink,
  paper,
} from "../../components/FootprintCartoons";
import { InlineOnboarding } from "../../components/InlineOnboarding";
import { Wordmark } from "../../components/Wordmark";
import { MorphNav, GearIcon, type MorphTab } from "../../components/MorphNav";
import { Pip } from "../../components/Pip";
import { CountUp, ScoreCountUp } from "../../components/ScoreCountUp";
import { PlatformsPane, SettingsPane } from "../../components/SettingsPane";
import { StreakFlame } from "../../components/StreakFlame";
import { Button } from "../../components/ui/button";
import insights from "../../data/insights.json";
import platformsData from "../../data/platforms.json";
import { bgBackend } from "../../lib/backendBridge";
import { classify } from "../../lib/classify";
import {
  ONBOARDING_POPUP_HEIGHT,
  POPUP_HEIGHT,
  POPUP_WIDTH,
} from "../../lib/layout";
import type { ReportCardData } from "../../lib/reportCard";
import {
  daySavings,
  monthSavings,
  weekSavings,
} from "../../lib/savings";
import { lastNDays, localDateKey, score } from "../../lib/score";
import type { CoachChoiceRow } from "../../lib/coachChoice";
import {
  DEFAULT_STATE,
  readCoachChoices,
  readState,
  type PuddleState,
} from "../../lib/storage";
import { computeStreak } from "../../lib/streak";
import {
  FOOTPRINT_MODELS,
  FOOTPRINT_SOURCE_NOTE,
  TREE_SOURCE_NOTE,
  treeMinutesFromCo2G,
} from "../../lib/footprint";
import { projectTotals } from "../../lib/projection";
import { dayTotals } from "../../lib/totals";
import { monthTotals, weekTotals } from "../../lib/weekTotals";
import type { Platform } from "../../lib/types";

const platforms = platformsData as Platform[];
const models = FOOTPRINT_MODELS;

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
  const [choices, setChoices] = useState<CoachChoiceRow[]>([]);

  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";
    document.body.style.width = `${POPUP_WIDTH}px`;
  }, []);

  // Setup screens are shorter; Chrome's popup and the floating panel follow
  const shellHeight =
    ready && !state.onboarded ? ONBOARDING_POPUP_HEIGHT : POPUP_HEIGHT;
  useEffect(() => {
    document.body.style.height = `${shellHeight}px`;
    if (window.parent !== window) {
      // Only a number; the panel checks the message came from its own frame
      window.parent.postMessage(
        { type: "touchgrass/size", height: shellHeight },
        "*",
      );
    }
  }, [shellHeight]);

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
        // Real history only: an empty range shows zeros, never demo rows
        const usage = s.usage;
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
    void readCoachChoices()
      .then(setChoices)
      .catch(() => undefined);
  }, [state.onboarded]);

  const today = new Date();
  // Week/month: scaled from the daily average until there's a full window of history
  const byPeriod = {
    day: {
      totals: {
        ...dayTotals(state.usage, today, models),
        days: 1,
        projected: false,
        basisDays: 1,
      },
      savedCo2G: daySavings(state.usage, today, platforms, models).co2_g,
    },
    week: {
      totals: projectTotals(weekTotals(state.usage, today, models), state.usage, today, 7),
      savedCo2G: projectTotals(weekSavings(state.usage, today, platforms, models), state.usage, today, 7).co2_g,
    },
    month: {
      totals: projectTotals(monthTotals(state.usage, today, models), state.usage, today, 30),
      savedCo2G: projectTotals(monthSavings(state.usage, today, platforms, models), state.usage, today, 30).co2_g,
    },
  };
  const { totals, savedCo2G } = byPeriod[period];
  const estTag = totals.projected ? "(projected)" : "(est.)";
  const treeMinutes = treeMinutesFromCo2G(savedCo2G);
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
  const images = slice.reduce(
    (acc, r) => acc + (r.kind === "image" ? 1 : 0) + (r.attachments ?? 0),
    0,
  );
  const videos = slice.filter((r) => r.kind === "video").length;
  const smallPct = Math.round((small / n) * 100);
  const choiceSlice = choices.filter((c) =>
    inRange.has(localDateKey(new Date(c.ts))),
  );
  const choiceCounts = {
    switch_here: choiceSlice.filter((c) => c.choice === "switch_here").length,
    open_other: choiceSlice.filter((c) => c.choice === "open_other").length,
    send_anyway: choiceSlice.filter((c) => c.choice === "send_anyway").length,
    not_now: choiceSlice.filter((c) => c.choice === "not_now").length,
  };
  const tip =
    slice.length === 0
      ? "No prompts recorded in this range yet. Send one on an AI site you picked in setup."
      : `${smallPct}% of your ${slice.length} ${slice.length === 1 ? "prompt was a simple question" : "prompts were simple questions"} a small model could answer.`;

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
      co2SavedG: savedCo2G,
      treeMinutes,
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
    savedCo2G,
    treeMinutes,
    smallPct,
    totals.Wh,
    totals.water_L,
    totals.co2_g,
    today,
  ]);

  const shell = {
    width: POPUP_WIDTH,
    height: shellHeight,
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
      <Wordmark />
      {screen === "home" ? (
        <>
          <ScoreHero
            score={state.score}
            streak={state.streak}
            userName={state.userName}
          />

          <PeriodSwitch period={period} onChange={setPeriod} />
          <PeriodMeta
            period={period}
            days={totals.days}
            prompts={slice.length}
            projectedFrom={totals.projected ? totals.basisDays : null}
          />

          <div className="grid grid-cols-2 gap-2" data-testid="footprint-ticks">
            <CartoonTick
              label={`power used ${estTag}`}
              hint={`Estimated electricity these prompts used, in watt-hours. ${FOOTPRINT_SOURCE_NOTE}`}
              value={totals.Wh}
              decimals={2}
              suffix=" Wh"
              testId="tick-energy"
              wash="var(--tg-yellow)"
            >
              <EnergyBolt size={56} />
            </CartoonTick>
            <CartoonTick
              label={`water used ${estTag}`}
              hint={`Estimated water for server cooling and power, in millilitres. ${FOOTPRINT_SOURCE_NOTE}`}
              value={totals.water_L * 1000}
              decimals={1}
              suffix=" mL"
              testId="tick-water"
              wash="var(--tg-blue)"
            >
              <WaterDrop size={56} />
            </CartoonTick>
            <CartoonTick
              label={`carbon out ${estTag}`}
              hint={`Estimated CO₂e from the power those prompts used, in grams. ${FOOTPRINT_SOURCE_NOTE}`}
              value={totals.co2_g}
              decimals={2}
              suffix=" g"
              testId="tick-co2"
              wash="var(--tg-pink)"
            >
              <Co2Cloud size={56} />
            </CartoonTick>
            <CartoonTick
              label={`trees ${estTag}`}
              hint={`${TREE_SOURCE_NOTE} You saved ≈${savedCo2G.toFixed(2)} g CO₂e.`}
              value={treeMinutes}
              decimals={1}
              suffix=" tree-min"
              testId="tick-trees"
              wash="var(--tg-green)"
            >
              <TreeGrove size={56} count={Math.min(5, Math.max(1, Math.ceil(treeMinutes / 10)))} />
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
              <PeriodMeta
                period={period}
                days={totals.days}
                prompts={slice.length}
                projectedFrom={totals.projected ? totals.basisDays : null}
              />

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
                    wash="var(--tg-blue)"
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
                        wash="var(--tg-green)"
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
                        wash="var(--tg-yellow)"
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
                        badge={`${videos}×`}
                        wash="var(--tg-pink)"
                        icon={<MixClapper size={36} />}
                        text={
                          videos === 0
                            ? "No video jobs in this range. We estimate one AI video uses about as much energy as 1,000 text prompts."
                            : videos === 1
                              ? "video job in this range. We estimate one clip ≈ 1,000 text prompts of energy."
                              : "video jobs in this range. We estimate one clip ≈ 1,000 text prompts of energy."
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
                      wash="var(--tg-card)"
                      icon={<MixBubble size={36} />}
                      text={i.text}
                    />
                  );
                })}
                {choiceSlice.length > 0 ? (
                  <CoachNoteCard
                    key="coach-choices"
                    index={chalkTips.length + insights.length + 1}
                    testId="insight-coach-choices"
                    badge={String(choiceSlice.length)}
                    wash="var(--tg-green)"
                    icon={<MiniModel size={36} />}
                    text={`coach picks: ${choiceCounts.switch_here} switched here, ${choiceCounts.open_other} opened elsewhere, ${choiceCounts.send_anyway} sent anyway, ${choiceCounts.not_now} not now.`}
                  />
                ) : null}
                {images > 0 ? (
                  <CoachNoteCard
                    key="image-jobs"
                    index={chalkTips.length + insights.length}
                    badge={String(images)}
                    wash="var(--tg-blue)"
                    icon={<MixFrame size={36} />}
                    text={
                      images === 1
                        ? "image sent or generated. Those cost more than text."
                        : "images sent or generated. Those cost more than text."
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
    clamped >= 45 ? "var(--tg-green)" : "var(--tg-yellow-deep)";
  const blade =
    clamped >= 45 ? "var(--tg-green-deep)" : "var(--tg-muted)";
  const bladeLight =
    clamped >= 45 ? "var(--tg-green-soft)" : "var(--tg-yellow)";
  const wash =
    clamped >= 70 ? "var(--tg-yellow)" : clamped >= 45 ? "var(--tg-green-soft)" : "var(--tg-card)";

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
      className="relative flex items-center justify-between gap-2 overflow-hidden px-3 py-2"
      style={{ background: wash, borderRadius: "var(--tg-radius-card)" }}
    >
      <svg
        viewBox="0 0 320 40"
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-7 w-full"
        preserveAspectRatio="none"
      >
        <path
          d="M0 34 Q80 26 160 33 T320 31 L320 40 L0 40 Z"
          style={{ fill: bladeLight }}
          opacity="0.65"
        />
        <path
          d="M0 36 Q95 30 190 35 T320 34 L320 40 L0 40 Z"
          style={{ fill: turf }}
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
                style={{ stroke: idx % 3 === 0 ? blade : turf }}
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
              className="font-sans text-[2.5rem] font-medium leading-none tracking-tight text-foreground tabular-nums"
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

/** Rolling windows: "week" = last 7 days, "month" = last 30 days (not calendar). */
function PeriodMeta({
  period,
  days,
  prompts,
  projectedFrom,
}: {
  period: Period;
  days: number;
  prompts: number;
  /** Days of history the projection is scaled from; null = actual totals. */
  projectedFrom: number | null;
}) {
  const range =
    period === "day" ? "Today" : period === "week" ? "Last 7 days" : "Last 30 days";
  const count =
    prompts === 0
      ? "no prompts recorded yet"
      : `${prompts} ${prompts === 1 ? "prompt" : "prompts"}${
          period === "day" ? "" : ` on ${days} ${days === 1 ? "day" : "days"}`
        }`;
  return (
    <p className="m-0 text-xs text-muted-foreground" data-testid="period-meta">
      {range} · {count}
      {projectedFrom
        ? ` · projected from ${projectedFrom} ${projectedFrom === 1 ? "day" : "days"} of use`
        : ""}
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
  icon,
  text,
  index = 0,
}: {
  testId?: string;
  badge: string;
  /** Card fill: a --tg-* pastel. */
  wash: string;
  icon: ReactNode;
  text: string;
  index?: number;
}) {
  return (
    <li
      data-testid={testId}
      className="ui-note-enter flex list-none items-start gap-2.5 px-3 py-2.5"
      style={
        {
          ["--i" as string]: index,
          background: wash,
          borderRadius: "var(--tg-radius-card)",
        } as CSSProperties
      }
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center"
        style={{ background: "var(--tg-cream)", borderRadius: "var(--tg-radius-pill)" }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <span
          className="mb-1 inline-flex px-2 py-0.5 text-[11px] font-semibold tabular-nums"
          style={{
            background: "var(--tg-ink)",
            color: "var(--tg-on-ink)",
            borderRadius: "var(--tg-radius-pill)",
          }}
        >
          {badge}
        </span>
        <p className="m-0 text-xs leading-snug text-foreground">{text}</p>
      </div>
    </li>
  );
}

/* Hand-drawn insight icons (ink + paper). Animation classes kept on the same elements. */
function MiniModel({ size = 56 }: { size?: number }) {
  return (
    <svg className="ft-subtle" width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <InkDefs />
      <path d="M17 29 H23 M17 36 H23 M17 43 H23 M49 29 H55 M49 36 H55 M49 43 H55" {...ink} strokeWidth={2.6} />
      <g className="ft-drop">
        <rect x="24" y="21" width="24" height="30" rx="5" {...paper} />
        <path d="M30 31 H42 M30 37 H38" {...ink} strokeWidth={2.4} />
      </g>
    </svg>
  );
}

function RegenSpin({ size = 56 }: { size?: number }) {
  return (
    <svg className="ft-subtle" width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <InkDefs />
      <circle cx="36" cy="36" r="13" fill={PAPER} filter={ROUGH} />
      <path className="ft-orbit" d="M36 18 A18 18 0 1 1 20 42" {...ink} strokeWidth={3.4} />
      <path d="M17 35 L20 44 L29 40" {...ink} />
    </svg>
  );
}

function MixBubble({ size = 56 }: { size?: number }) {
  return (
    <svg className="ft-subtle" width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <InkDefs />
      <ellipse className="ft-cloud" cx="36" cy="32" rx="19" ry="14" {...paper} />
      <path d="M27 44 L22 55 L37 45" {...ink} />
      <path d="M28 30 C30 28 32 32 34 30 C36 28 38 32 40 30 C42 28 44 32 45 30" {...ink} strokeWidth={2.2} />
    </svg>
  );
}

function MixFrame({ size = 56 }: { size?: number }) {
  return (
    <svg className="ft-subtle" width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <InkDefs />
      <rect className="ft-bolt" x="15" y="19" width="42" height="32" rx="4" {...paper} />
      <circle cx="27" cy="31" r="4" {...ink} strokeWidth={2.4} />
      <path d="M19 48 L30 37 L37 43 L46 33 L54 46" {...ink} strokeWidth={2.6} />
    </svg>
  );
}

function MixClapper({ size = 56 }: { size?: number }) {
  return (
    <svg className="ft-subtle" width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <InkDefs />
      <rect className="ft-drop" x="17" y="30" width="38" height="23" rx="3" {...paper} />
      <path d="M17 30 L27 17 L55 17 L45 30" {...ink} />
      <path d="M33 17 L27 30 M43 17 L37 30" {...ink} strokeWidth={2.4} />
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
      className="flex cursor-help flex-col items-center px-2 py-2 text-center"
      style={{ background: wash, borderRadius: "var(--tg-radius-tile)" }}
    >
      {children}
      <CountUp
        key={`${testId}-${value}`}
        value={value}
        decimals={decimals}
        suffix={suffix}
        durationMs={700}
        data-testid={testId}
        className="mt-1 block text-base font-semibold tabular-nums"
      />
      <div className="text-[11px] font-medium text-[var(--tg-ink-soft)]">{label}</div>
    </div>
  );
}
