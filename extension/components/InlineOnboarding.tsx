import {
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { AccountCartoon, LocalShieldCartoon } from "./MorphNav";
import { PlatformGrid } from "./PlatformGrid";
import { Pip } from "./Pip";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import platformsData from "../data/platforms.json";
import usageSeed from "../data/usage-seed.json";
import {
  canContinueOnboarding,
  customPlatformId,
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
          <Pip size={64} variant="sticker" pose="hello" tilt={-6} />
        </div>
      ) : null}

      <header className={`relative z-10 ${step === 2 ? "pr-16" : ""}`}>
        <h1
          data-testid="puddle-title"
          className="font-brand m-0 text-2xl font-semibold tracking-tight"
        >
          Touchgrass
        </h1>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">
          {step === 1
            ? "Meet Pip, your AI footprint buddy"
            : step === 2
              ? trimmedName
                ? `Which AI tabs do you use, ${trimmedName}?`
                : "Which AI tabs should I watch?"
              : trimmedName
                ? `Almost ready, ${trimmedName}!`
                : "Almost ready"}
        </p>
      </header>

      <StepPills step={step} onSelect={(s) => s < step && setStep(s)} />

      {step === 1 ? (
        <form
          onSubmit={submitNameForm}
          className="relative z-10 flex min-h-0 flex-1 flex-col gap-3"
        >
          {/* Jitter-animated hero card with Pip & swaying grass */}
          <div
            className="ui-note-enter relative flex flex-col items-center justify-center overflow-hidden rounded-2xl px-4 pt-4 pb-6 text-center"
            style={
              {
                background: "#e8f6df",
                ["--i" as string]: 0,
              } as CSSProperties
            }
          >
            <GrassWave />
            <div className="pip-svg--idle ui-score-pop relative z-10">
              <Pip size={104} variant="sticker" pose="hello" tilt={-5} />
            </div>
            <div className="relative z-10 mt-2 rounded-xl bg-white/90 px-3 py-1.5 shadow-sm">
              <p className="m-0 text-xs font-medium text-foreground">
                {trimmedName
                  ? `Hey ${trimmedName}! Ready to save some trees?`
                  : "Hi! I'm Pip. What should I call you?"}
              </p>
            </div>
          </div>

          {/* Account Name Input Card */}
          <div
            className="ui-note-enter flex items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-2.5"
            style={{ ["--i" as string]: 1 } as CSSProperties}
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

          <SplitCta
            testId="name-continue"
            disabled={!canContinueName}
            onClick={() => setStep(2)}
            className="mt-auto self-stretch"
          >
            Continue
          </SplitCta>
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

          <div className="relative z-10 min-h-0 flex-1 overflow-y-auto pr-0.5">
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
          <InfoCard index={0} wash="#e8f6df" icon={<LocalShieldCartoon size={36} />}>
            <p className="m-0 text-xs font-semibold leading-snug">
              Prompts stay on this computer.
            </p>
            <p className="m-0 mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Saved in LocalStorage on your device. Nothing leaves your machine.
            </p>
          </InfoCard>
          <InfoCard
            index={1}
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
          <div
            className="ui-note-enter flex flex-1 items-center justify-center py-1"
            style={{ ["--i" as string]: 2 } as CSSProperties}
          >
            <div className="pip-svg--idle ui-score-pop">
              <Pip size={108} variant="sticker" pose="gotit" tilt={4} />
            </div>
          </div>
          <div className="mt-auto flex items-center gap-2">
            <button
              type="button"
              className="rounded-full bg-[#f4f4f5] px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setStep(2)}
            >
              Back
            </button>
            <SplitCta
              testId="got-it"
              disabled={busy}
              onClick={() => void finish()}
              className="flex-1"
            >
              Got it
            </SplitCta>
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

function InfoCard({
  wash,
  icon,
  children,
  testId,
  index = 0,
}: {
  wash: string;
  icon: ReactNode;
  children: ReactNode;
  testId?: string;
  index?: number;
}) {
  return (
    <div
      data-testid={testId}
      className="ui-note-enter flex items-start gap-2.5 rounded-xl border border-border bg-white px-2.5 py-2"
      style={{ ["--i" as string]: index } as CSSProperties}
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
