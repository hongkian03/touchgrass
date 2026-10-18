import {
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { BrandIcon } from "./BrandIcon";
import {
  Co2Cloud,
  EnergyBolt,
  TreeGrove,
  WaterDrop,
} from "./FootprintCartoons";
import { AccountCartoon, LocalShieldCartoon } from "./MorphNav";
import { PlatformGrid, buildPlatformGridItems } from "./PlatformGrid";
import { Pip } from "./Pip";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import platformsData from "../data/platforms.json";
import usageSeed from "../data/usage-seed.json";
import {
  canContinueOnboarding,
  customPlatformId,
  faviconForHost,
  hostsForPlatforms,
  isCustomPlatformId,
  resolvePlatformFromInput,
} from "../lib/hosts";
import type { AiSiteVerdict } from "../lib/groqClassify";
import { score } from "../lib/score";
import { writeState, type PuddleState } from "../lib/storage";
import { computeStreak } from "../lib/streak";
import type { Platform, UsageRow } from "../lib/types";

const platforms = platformsData as Platform[];

type Step = 1 | 2 | 3;

type Props = {
  onComplete: (state: PuddleState) => void;
};

export function InlineOnboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [userName, setUserName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [barError, setBarError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinueName = userName.trim().length > 0;
  const canContinuePlatforms = useMemo(
    () => canContinueOnboarding(selected.length),
    [selected.length],
  );
  const customSelected = selected.filter(isCustomPlatformId);
  const trimmedName = userName.trim();

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submitNameForm = (e: FormEvent) => {
    e.preventDefault();
    if (canContinueName) setStep(2);
  };

  const submitBar = (e: FormEvent) => {
    e.preventDefault();
    void (async () => {
      setBarError(null);
      const trimmed = query.trim();
      if (!trimmed) return;

      const resolved = resolvePlatformFromInput(trimmed, platforms);
      if (resolved.ok) {
        setSelected((prev) =>
          prev.includes(resolved.id) ? prev : [...prev, resolved.id],
        );
        setQuery("");
        return;
      }

      if (resolved.reason === "invalid") {
        setBarError("Only AI platforms");
        return;
      }

      const host = resolved.hostname;
      if (!host) {
        setBarError("Only AI platforms");
        return;
      }
      try {
        const verdict = (await browser.runtime.sendMessage({
          type: "puddle/classify-ai-site",
          hostname: host,
        })) as AiSiteVerdict;
        if (verdict?.isAi) {
          const id = customPlatformId(host);
          setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]));
          setQuery("");
          return;
        }
      } catch {
        // Groq unavailable
      }
      setBarError("Only AI platforms");
    })();
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    const origins = hostsForPlatforms(selected, platforms);
    try {
      if (origins.length > 0) {
        try {
          await browser.permissions.request({ origins });
        } catch {
          // Custom sites may be outside the optional list.
        }
      }
      const usage = usageSeed as UsageRow[];
      const today = new Date();
      const dayScore = score(usage, today, platforms);
      const streak = computeStreak(usage, today, platforms);
      const next: PuddleState = {
        onboarded: true,
        userName: trimmedName,
        enabledPlatforms: selected,
        usage,
        score: dayScore,
        streak,
        lastCoachAt: 0,
      };
      await writeState(next);
      try {
        await browser.runtime.sendMessage({
          type: "puddle/coach-rebind",
          enabledPlatforms: selected,
        });
      } catch {
        // background may be waking
      }
      onComplete(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish setup");
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="inline-onboarding"
      data-step={step}
      className="relative flex h-full min-h-0 flex-col gap-2.5 overflow-hidden"
    >
      {step === 2 ? (
        <div className="pip-peek pip-peek--popup" aria-hidden="true">
          <Pip size={68} variant="sticker" pose="search" tilt={-6} />
        </div>
      ) : null}

      <header
        className={`relative z-10 jt-drop-in ${step === 2 ? "pr-16" : ""}`}
        style={{ ["--jt-delay" as string]: "0ms" } as CSSProperties}
      >
        <h1
          data-testid="puddle-title"
          className="font-brand m-0 text-2xl font-semibold tracking-tight"
        >
          Touchgrass
        </h1>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">
          {step === 1
            ? trimmedName
              ? `Nice to meet you, ${trimmedName}!`
              : "Meet Musky, your AI footprint buddy"
            : step === 2
              ? trimmedName
                ? `Which AI tabs do you use, ${trimmedName}?`
                : "Which AI tabs should I watch?"
              : trimmedName
                ? `Almost ready, ${trimmedName}!`
                : "Almost ready"}
        </p>
      </header>

      <div
        className="jt-drop-in"
        style={{ ["--jt-delay" as string]: "80ms" } as CSSProperties}
      >
        <StepPills step={step} onSelect={(s) => s < step && setStep(s)} />
      </div>

      {step === 1 ? (
        <form
          onSubmit={submitNameForm}
          className="relative z-10 flex min-h-0 flex-1 flex-col gap-3"
        >
          {/* Jitter intro: Musky + eco satellites converge into lawn stage */}
          <div
            data-testid="onboarding-hero-stage"
            className="jt-stage-card flex flex-col items-center gap-2 overflow-hidden rounded-2xl px-3 pt-3 pb-3.5 text-center"
            style={{ background: "#e8f6df" }}
          >
            <div className="relative flex min-h-[124px] w-full items-center justify-center">
              <div className="jt-grass-rise absolute inset-x-0 bottom-0">
                <GrassWave />
              </div>
              <EcoSatellites active={Boolean(trimmedName)} />
              <div className="jt-mascot-hero pip-svg--idle relative z-10">
                <Pip
                  size={104}
                  variant="sticker"
                  pose={trimmedName ? "plant" : "hello"}
                  tilt={-4}
                />
              </div>
            </div>
            <div
              key={trimmedName ? "named" : "hello"}
              data-testid="onboarding-greeting"
              className={[
                "relative z-10 rounded-xl bg-white/95 px-3 py-1.5 shadow-sm",
                trimmedName ? "jt-bubble-pop jt-bubble-react" : "jt-bubble-pop",
              ].join(" ")}
            >
              <p className="m-0 text-xs font-medium text-foreground">
                {trimmedName
                  ? `Hey ${trimmedName}! Ready to save some trees?`
                  : "Hi! I'm Musky. What should I call you?"}
              </p>
            </div>
          </div>

          {/* Account Name Input Card — docks up after hero settles */}
          <div
            className="jt-slot-up flex items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-2.5"
            style={{ ["--jt-delay" as string]: "480ms" } as CSSProperties}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "#e7f6ff" }}
            >
              <AccountCartoon size={36} />
            </div>
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                Your name
              </span>
              <Input
                data-testid="onboarding-name"
                type="text"
                autoFocus
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Type your name…"
                className="h-9 rounded-lg border-0 bg-[#f4f4f5] px-2.5 text-sm shadow-none focus-visible:ring-1"
                autoComplete="nickname"
              />
            </label>
          </div>

          <div
            className="jt-slot-up mt-auto self-stretch"
            style={{ ["--jt-delay" as string]: "600ms" } as CSSProperties}
          >
            <SplitCta
              testId="name-continue"
              disabled={!canContinueName}
              onClick={() => setStep(2)}
              className="w-full"
            >
              Continue
            </SplitCta>
          </div>
        </form>
      ) : step === 2 ? (
        <>
          <form
            onSubmit={submitBar}
            className="ui-note-enter relative z-10 w-full"
            style={{ ["--i" as string]: 0 } as CSSProperties}
          >
            <label className="block w-full">
              <span className="sr-only">
                Search platforms or paste a site URL
              </span>
              <Input
                data-testid="platform-search"
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setBarError(null);
                }}
                placeholder="Search or paste a site URL"
                className="h-9 rounded-xl border-0 bg-[#f4f4f5] shadow-none focus-visible:ring-1"
              />
            </label>
          </form>
          {barError ? (
            <p className="relative z-10 m-0 text-xs text-muted-foreground">
              {barError}
            </p>
          ) : null}

          <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-0.5 py-0.5">
            <PlatformGrid
              platforms={platforms}
              selected={selected}
              onToggle={toggle}
              query={query}
              customIds={customSelected}
            />
          </div>

          <div className="relative z-10 mt-auto flex items-center gap-2">
            <button
              type="button"
              className="rounded-full bg-[#f4f4f5] px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <SplitCta
              testId="continue"
              disabled={!canContinuePlatforms}
              onClick={() => setStep(3)}
              className="flex-1"
            >
              Continue ({selected.length})
            </SplitCta>
          </div>
        </>
      ) : (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-2">
          <InfoCard
            choreo="left"
            wash="#e8f6df"
            icon={<LocalShieldCartoon size={36} />}
          >
            <p className="m-0 text-xs font-semibold leading-snug">
              Prompts stay on this computer.
            </p>
            <p className="m-0 mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Saved in LocalStorage on your device. Nothing leaves your machine.
            </p>
          </InfoCard>
          <InfoCard
            choreo="right"
            wash="#e7f6ff"
            testId="onboarding-auto-coach"
            icon={<AccountCartoon size={36} />}
          >
            <p className="m-0 text-xs font-semibold leading-snug">
              Easy asks switch to a lighter model.
            </p>
            <p className="m-0 mt-0.5 text-[11px] leading-snug text-muted-foreground">
              If another chat site is needed, Touchgrass opens that tab and
              pastes your prompt.
            </p>
          </InfoCard>

          {/* Finale stage: chosen AI badges converge around thumbs-up Musky on sky-lagoon orbit stage */}
          <div
            data-testid="onboarding-finale-stage"
            className="jt-stage-card flex min-h-[144px] flex-1 flex-col items-center justify-between overflow-hidden rounded-2xl border border-[#cae9ff] px-3 pt-2 pb-2.5"
            style={{
              background:
                "linear-gradient(155deg, #e7f6ff 0%, #cae9ff 52%, #bee9e8 100%)",
            }}
          >
            <div className="relative flex min-h-[104px] w-full flex-1 items-center justify-center">
              <OrbitRing />
              <div className="jt-grass-rise absolute inset-x-0 bottom-0">
                <LagoonWave />
              </div>
              <FinaleSparks />
              <ChosenPlatformOrbit selected={selected} />
              <div className="jt-mascot-hero pip-svg--idle relative z-10">
                <Pip size={96} variant="sticker" pose="chill" tilt={3} />
              </div>
            </div>
            <p className="jt-bubble-pop relative z-10 m-0 rounded-full bg-white/95 px-2.5 py-0.5 text-[10px] font-semibold text-[#1b4965] shadow-sm">
              {trimmedName
                ? `${trimmedName}'s tabs · Watched by Musky`
                : "Watched by Musky"}
            </p>
          </div>

          <div className="mt-auto flex items-center gap-2">
            <button
              type="button"
              className="rounded-full bg-[#f4f4f5] px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setStep(2)}
            >
              Back
            </button>
            <div className="jt-cta-ready flex-1">
              <SplitCta
                testId="got-it"
                disabled={busy}
                onClick={() => void finish()}
                className="w-full"
              >
                Got it
              </SplitCta>
            </div>
          </div>
          {error ? <p className="m-0 text-xs">{error}</p> : null}
        </div>
      )}
    </div>
  );
}

function StepPills({
  step,
  onSelect,
}: {
  step: Step;
  onSelect?: (s: Step) => void;
}) {
  const steps = [
    { id: 1 as const, label: "1", name: "Name" },
    { id: 2 as const, label: "2", name: "AI tabs" },
    { id: 3 as const, label: "3", name: "Ready" },
  ] as const;
  const idx = step - 1;
  return (
    <div
      className="relative flex rounded-full bg-[#f4f4f5] p-1"
      role="tablist"
      aria-label="Onboarding steps"
    >
      <span
        aria-hidden="true"
        className="ui-period-thumb pointer-events-none absolute inset-y-1 start-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-white shadow-sm"
        style={{ transform: `translateX(calc(${idx} * 100%))` }}
      />
      {steps.map((s) => {
        const on = step === s.id;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect?.(s.id)}
            className={[
              "relative z-10 flex h-7 flex-1 items-center justify-center gap-1 rounded-full border-0 bg-transparent text-xs font-medium transition-colors",
              on ? "text-foreground" : "text-muted-foreground",
            ].join(" ")}
          >
            <span className="tabular-nums">{s.label}</span>
            <span className="text-[10px] font-normal">{s.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function GrassWave() {
  const blades = [18, 42, 68, 96, 124, 152, 180, 208, 236, 264, 292];
  return (
    <svg
      viewBox="0 0 320 36"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-6 w-full"
      preserveAspectRatio="none"
    >
      <path
        d="M0 28 Q80 20 160 27 T320 25 L320 36 L0 36 Z"
        fill="#8fd18f"
        opacity="0.65"
      />
      <path
        d="M0 31 Q95 24 190 30 T320 29 L320 36 L0 36 Z"
        fill="#5cb85c"
        opacity="0.45"
      />
      {blades.map((x, idx) => {
        const h = 10 + ((idx * 5) % 8);
        const lean = idx % 2 === 0 ? -4 : 5;
        return (
          <g
            key={x}
            transform={`translate(${x} 34)`}
            className="ft-grass"
            style={{ animationDelay: `${(idx % 5) * 160}ms` }}
          >
            <path
              d={`M0 0 Q${lean} ${-h * 0.55} ${lean * 0.6} ${-h}`}
              fill="none"
              stroke={idx % 3 === 0 ? "#3d8b40" : "#5cb85c"}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </svg>
  );
}

function OrbitRing() {
  return (
    <svg
      viewBox="0 0 260 140"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <ellipse
        cx="130"
        cy="70"
        rx="88"
        ry="42"
        fill="none"
        stroke="#5fa8d3"
        strokeOpacity="0.32"
        strokeWidth="1.5"
        strokeDasharray="4 5"
      />
      <ellipse
        cx="130"
        cy="70"
        rx="58"
        ry="28"
        fill="none"
        stroke="#1b4965"
        strokeOpacity="0.14"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function LagoonWave() {
  return (
    <svg
      viewBox="0 0 320 36"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-6 w-full"
      preserveAspectRatio="none"
    >
      <path
        d="M0 26 Q70 18 150 25 T320 23 L320 36 L0 36 Z"
        fill="#62b6cb"
        opacity="0.4"
      />
      <path
        d="M0 30 Q95 23 190 29 T320 27 L320 36 L0 36 Z"
        fill="#5fa8d3"
        opacity="0.35"
      />
    </svg>
  );
}

function InfoCard({
  wash,
  icon,
  children,
  testId,
  choreo = "enter",
}: {
  wash: string;
  icon: ReactNode;
  children: ReactNode;
  testId?: string;
  choreo?: "enter" | "left" | "right";
}) {
  const choreoClass =
    choreo === "left"
      ? "jt-card-left"
      : choreo === "right"
        ? "jt-card-right"
        : "ui-note-enter";
  return (
    <div
      data-testid={testId}
      className={`${choreoClass} flex items-start gap-2.5 rounded-xl border border-border bg-white px-2.5 py-2`}
      style={
        {
          ["--jt-delay" as string]:
            choreo === "left" ? "200ms" : choreo === "right" ? "320ms" : "0ms",
          ["--i" as string]: 0,
        } as CSSProperties
      }
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        style={{ background: wash }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </div>
  );
}

const ECO_SATELLITES: Array<{
  id: string;
  fromX: string;
  fromY: string;
  fromR: string;
  toX: string;
  toY: string;
  delay: string;
  wash: string;
  node: ReactNode;
}> = [
  {
    id: "bolt",
    fromX: "-86px",
    fromY: "-48px",
    fromR: "-28deg",
    toX: "-96px",
    toY: "-22px",
    delay: "120ms",
    wash: "#fff8dc",
    node: <EnergyBolt size={28} />,
  },
  {
    id: "drop",
    fromX: "86px",
    fromY: "-52px",
    fromR: "24deg",
    toX: "96px",
    toY: "-22px",
    delay: "180ms",
    wash: "#e7f6ff",
    node: <WaterDrop size={28} />,
  },
  {
    id: "cloud",
    fromX: "-98px",
    fromY: "42px",
    fromR: "-18deg",
    toX: "-88px",
    toY: "20px",
    delay: "240ms",
    wash: "#eef1f4",
    node: <Co2Cloud size={28} />,
  },
  {
    id: "tree",
    fromX: "98px",
    fromY: "44px",
    fromR: "22deg",
    toX: "88px",
    toY: "20px",
    delay: "300ms",
    wash: "#f4fbf0",
    node: <TreeGrove size={28} count={1} />,
  },
];

function EcoSatellites({ active }: { active: boolean }) {
  return (
    <>
      {ECO_SATELLITES.map((s) => (
        <span
          key={s.id}
          data-testid={`eco-orbit-${s.id}`}
          className={[
            "jt-orbit-badge flex h-9 w-9 items-center justify-center rounded-xl border border-white/80 shadow-sm",
            active ? "jt-orbit-bob" : "",
          ].join(" ")}
          style={
            {
              background: s.wash,
              ["--from-x" as string]: s.fromX,
              ["--from-y" as string]: s.fromY,
              ["--from-r" as string]: s.fromR,
              ["--to-x" as string]: s.toX,
              ["--to-y" as string]: s.toY,
              ["--jt-delay" as string]: s.delay,
            } as CSSProperties
          }
        >
          {s.node}
        </span>
      ))}
    </>
  );
}

const ORBIT_SLOTS: Array<{
  fromX: string;
  fromY: string;
  fromR: string;
  toX: string;
  toY: string;
}> = [
  {
    fromX: "-115px",
    fromY: "-40px",
    fromR: "-30deg",
    toX: "-88px",
    toY: "-20px",
  },
  {
    fromX: "115px",
    fromY: "-44px",
    fromR: "28deg",
    toX: "88px",
    toY: "-20px",
  },
  {
    fromX: "-120px",
    fromY: "40px",
    fromR: "-20deg",
    toX: "-92px",
    toY: "18px",
  },
  {
    fromX: "120px",
    fromY: "42px",
    fromR: "18deg",
    toX: "92px",
    toY: "18px",
  },
  {
    fromX: "0px",
    fromY: "-70px",
    fromR: "8deg",
    toX: "-52px",
    toY: "-34px",
  },
];

function ChosenPlatformOrbit({ selected }: { selected: string[] }) {
  const customIds = selected.filter(isCustomPlatformId);
  const items = buildPlatformGridItems(platforms, customIds).filter((p) =>
    selected.includes(p.id),
  );
  const shown = items.slice(0, 5);
  if (shown.length === 0) return null;

  return (
    <>
      {shown.map((p, idx) => {
        const slot = ORBIT_SLOTS[idx] ?? ORBIT_SLOTS[0]!;
        return (
          <span
            key={p.id}
            data-testid={`finale-orbit-${p.id}`}
            className="jt-orbit-badge flex h-8 w-8 items-center justify-center rounded-full border border-white bg-white shadow-sm"
            style={
              {
                ["--from-x" as string]: slot.fromX,
                ["--from-y" as string]: slot.fromY,
                ["--from-r" as string]: slot.fromR,
                ["--to-x" as string]: slot.toX,
                ["--to-y" as string]: slot.toY,
                ["--jt-delay" as string]: `${120 + idx * 70}ms`,
              } as CSSProperties
            }
          >
            {p.kind === "custom" && p.faviconHost ? (
              <img
                src={faviconForHost(p.faviconHost)}
                alt=""
                width={20}
                height={20}
                className="rounded-full"
                style={{ width: 20, height: 20, objectFit: "contain" }}
              />
            ) : (
              <BrandIcon slug={p.icon ?? ""} size={20} label={p.name} />
            )}
          </span>
        );
      })}
    </>
  );
}

function FinaleSparks() {
  const sparks = [
    { x: "18%", y: "22%", delay: "700ms", color: "#f5c400", r: 3 },
    { x: "78%", y: "18%", delay: "820ms", color: "#5cb85c", r: 2.5 },
    { x: "22%", y: "68%", delay: "900ms", color: "#8fd18f", r: 2.2 },
    { x: "82%", y: "62%", delay: "760ms", color: "#f5c400", r: 2.8 },
  ];
  return (
    <>
      {sparks.map((s, i) => (
        <svg
          key={i}
          className="jt-sparkle"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          aria-hidden="true"
          style={
            {
              left: s.x,
              top: s.y,
              ["--jt-delay" as string]: s.delay,
            } as CSSProperties
          }
        >
          <circle cx="7" cy="7" r={s.r} fill={s.color} />
        </svg>
      ))}
    </>
  );
}

function SplitCta({
  children,
  onClick,
  testId,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  testId: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      data-testid={testId}
      disabled={disabled}
      size="lg"
      className={["ui-btn-press relative overflow-hidden pe-12", className]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      {children}
      <span className="ui-btn-chevron pointer-events-none absolute inset-y-0 end-0 flex w-9 items-center justify-center bg-primary-foreground/15">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="opacity-60"
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
