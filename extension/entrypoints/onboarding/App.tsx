import { useMemo, useState, type FormEvent } from "react";
import { Pip } from "../../components/Pip";
import { PlatformGrid } from "../../components/PlatformGrid";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import platformsData from "../../data/platforms.json";
import usageSeed from "../../data/usage-seed.json";
import {
  canContinueOnboarding,
  customPlatformId,
  hostsForPlatforms,
  isCustomPlatformId,
  resolvePlatformFromInput,
} from "../../lib/hosts";
import type { AiSiteVerdict } from "../../lib/groqClassify";
import { ONBOARDING_MAX_WIDTH } from "../../lib/layout";
import { score } from "../../lib/score";
import { writeState } from "../../lib/storage";
import { computeStreak } from "../../lib/streak";
import type { Platform, UsageRow } from "../../lib/types";

const platforms = platformsData as Platform[];

export function OnboardingApp() {
  const [step, setStep] = useState<1 | 2>(1);
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

      // Not on allowlist — ask Groq if this is an AI product.
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
        // Groq unavailable — fall through to reject
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
        await browser.permissions.request({ origins });
      }
      const usage = usageSeed as UsageRow[];
      const today = new Date();
      const dayScore = score(usage, today, platforms);
      const streak = computeStreak(usage, today, platforms);
      await writeState({
        onboarded: true,
        enabledPlatforms: selected,
        usage,
        score: dayScore,
        streak,
        lastCoachAt: 0,
      });
      window.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish setup");
      setBusy(false);
    }
  };

  return (
    <main
      data-testid="onboarding"
      className="flex min-h-screen items-center justify-center bg-[var(--pale-sky)] p-4 text-foreground font-sans"
    >
      {/* Compact panel — same chrome scale as the popup, not full desktop */}
      <div
        data-testid="onboarding-column"
        className="relative flex w-full flex-col items-stretch gap-4 overflow-hidden rounded-2xl bg-white px-4 pb-6 pt-5 shadow-sm"
        style={{
          maxWidth: ONBOARDING_MAX_WIDTH,
          minHeight: 520,
        }}
      >
        <div className="pip-peek pip-peek--panel" aria-hidden="true">
          <Pip size={96} variant="sticker" tilt={-6} />
        </div>

        <div className="relative z-10 pr-24">
          <h1
            data-testid="puddle-title"
            className="m-0 text-2xl font-semibold tracking-tight"
          >
            Puddle
          </h1>
          {step === 1 ? (
            <p className="mt-1.5 mb-0 text-sm text-muted-foreground">
              Which AI tabs should I watch?
            </p>
          ) : null}
        </div>

        {step === 1 ? (
          <>
            <form onSubmit={submitBar} className="relative z-10 w-full">
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
                  className="bg-white"
                />
              </label>
            </form>
            {barError ? (
              <p className="relative z-10 m-0 w-full text-sm text-muted-foreground">
                {barError}
              </p>
            ) : null}
            <div className="relative z-10">
              <PlatformGrid
                platforms={platforms}
                selected={selected}
                onToggle={toggle}
                query={query}
                customIds={customSelected}
              />
            </div>
            <Button
              type="button"
              data-testid="continue"
              disabled={!canContinue}
              size="lg"
              className="relative z-10 mt-auto min-w-[160px] self-center"
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          </>
        ) : (
          <div className="relative z-10 flex flex-1 flex-col gap-4">
            <p className="m-0 max-w-[240px] text-base leading-snug">
              Prompts stay on this computer.
            </p>
            <Button
              type="button"
              data-testid="got-it"
              disabled={busy}
              size="lg"
              className="min-w-[160px] self-start"
              onClick={() => void finish()}
            >
              Got it
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="self-start"
              onClick={() => setStep(1)}
            >
              Back
            </Button>
            {error ? <p className="text-sm">{error}</p> : null}
          </div>
        )}
      </div>
    </main>
  );
}
