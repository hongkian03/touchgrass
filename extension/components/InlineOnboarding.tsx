import { useMemo, useState, type FormEvent, type ReactNode } from "react";
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

type Props = {
  onComplete: (state: PuddleState) => void;
};

export function InlineOnboarding({ onComplete }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [userName, setUserName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [barError, setBarError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = useMemo(
    () => canContinueOnboarding(selected.length),
    [selected.length],
  );
  const customSelected = selected.filter(isCustomPlatformId);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
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
        userName: userName.trim(),
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
      className="relative flex h-full min-h-0 flex-col gap-2.5 overflow-hidden"
    >
      {step === 1 ? (
        <div className="pip-peek pip-peek--popup" aria-hidden="true">
          <Pip size={72} variant="sticker" pose="hello" tilt={-6} />
        </div>
      ) : null}

      <header className={`relative z-10 ${step === 1 ? "pr-20" : ""}`}>
        <h1
          data-testid="puddle-title"
          className="font-brand m-0 text-2xl font-semibold tracking-tight"
        >
          Touchgrass
        </h1>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">
          {step === 1
            ? "Name + which AI tabs to watch"
            : userName.trim()
              ? `Almost ready, ${userName.trim()}`
              : "Almost ready"}
        </p>
      </header>

      <StepPills step={step} />

      {step === 1 ? (
        <>
          <label className="relative z-10 block w-full">
            <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
              What should Pip call you?
            </span>
            <Input
              data-testid="onboarding-name"
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Your name"
              className="h-9 rounded-xl border-0 bg-[#f4f4f5] shadow-none focus-visible:ring-1"
              autoComplete="nickname"
            />
          </label>

          <form onSubmit={submitBar} className="relative z-10 w-full">
            <label className="block w-full">
              <span className="sr-only">Search platforms or paste a site URL</span>
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

          <SplitCta
            testId="continue"
            disabled={!canContinue}
            onClick={() => setStep(2)}
            className="relative z-10 mt-auto self-stretch"
          >
            Continue
          </SplitCta>
        </>
      ) : (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-2">
          <InfoCard wash="#e7f6ff">
            <p className="m-0 text-sm font-medium leading-snug">
              Prompts stay on this computer.
            </p>
            <p className="m-0 mt-1 text-[11px] leading-snug text-muted-foreground">
              Nothing leaves your machine for scoring or coaching.
            </p>
          </InfoCard>
          <InfoCard wash="#e8f6df" testId="onboarding-auto-coach">
            <p className="m-0 text-sm font-medium leading-snug">
              Easy asks switch to a lighter model.
            </p>
            <p className="m-0 mt-1 text-[11px] leading-snug text-muted-foreground">
              If another chat site is needed, Touchgrass opens that tab and pastes
              your prompt.
            </p>
          </InfoCard>
          <div className="flex flex-1 items-end justify-center py-1">
            <Pip size={110} variant="sticker" pose="gotit" tilt={4} />
          </div>
          <SplitCta
            testId="got-it"
            disabled={busy}
            onClick={() => void finish()}
            className="self-stretch"
          >
            Got it
          </SplitCta>
          <button
            type="button"
            className="self-center border-0 bg-transparent p-1 text-xs text-muted-foreground"
            onClick={() => setStep(1)}
          >
            Back
          </button>
          {error ? <p className="m-0 text-xs">{error}</p> : null}
        </div>
      )}
    </div>
  );
}

function StepPills({ step }: { step: 1 | 2 }) {
  return (
    <div
      className="flex rounded-full bg-[#f4f4f5] p-1"
      role="tablist"
      aria-label="Onboarding steps"
    >
      {(
        [
          { id: 1 as const, label: "1", name: "Setup" },
          { id: 2 as const, label: "2", name: "How it works" },
        ] as const
      ).map((s) => {
        const on = step === s.id;
        return (
          <div
            key={s.id}
            role="tab"
            aria-selected={on}
            className={[
              "flex h-7 flex-1 items-center justify-center gap-1 rounded-full text-xs font-medium",
              on
                ? "bg-white text-foreground shadow-sm"
                : "bg-transparent text-muted-foreground",
            ].join(" ")}
          >
            <span className="tabular-nums">{s.label}</span>
            <span className="text-[10px] font-normal">{s.name}</span>
          </div>
        );
      })}
    </div>
  );
}

function InfoCard({
  wash,
  children,
  testId,
}: {
  wash: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-xl px-3 py-2"
      style={{ background: wash }}
    >
      {children}
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
      className={["relative overflow-hidden pe-12", className]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      {children}
      <span className="pointer-events-none absolute inset-y-0 end-0 flex w-9 items-center justify-center bg-primary-foreground/15">
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
