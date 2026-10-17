import { useMemo, useState, type CSSProperties } from "react";
import { Pip } from "../../components/Pip";
import { PlatformGrid } from "../../components/PlatformGrid";
import platformsData from "../../data/platforms.json";
import usageSeed from "../../data/usage-seed.json";
import { canContinueOnboarding, hostsForPlatforms } from "../../lib/hosts";
import { ONBOARDING_MAX_WIDTH } from "../../lib/layout";
import { score } from "../../lib/score";
import { writeState } from "../../lib/storage";
import { computeStreak } from "../../lib/streak";
import type { Platform, UsageRow } from "../../lib/types";

const platforms = platformsData as Platform[];

export function OnboardingApp() {
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = useMemo(
    () => canContinueOnboarding(selected.length),
    [selected.length],
  );

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
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
      className="min-h-screen px-4 py-8"
      style={{ background: "var(--pale-sky)", color: "var(--yale-blue)" }}
    >
      <div
        data-testid="onboarding-column"
        className="mx-auto flex flex-col items-center gap-4"
        style={{ maxWidth: ONBOARDING_MAX_WIDTH, width: "100%" }}
      >
        <Pip size={96} />
        <h1
          data-testid="puddle-title"
          style={{ fontFamily: "Castoro, serif", fontSize: "2rem", margin: 0 }}
        >
          Puddle
        </h1>

        {step === 1 ? (
          <>
            <p
              style={{
                fontFamily: "Castoro, serif",
                textAlign: "center",
                margin: 0,
              }}
            >
              Which AI tabs should I watch?
            </p>
            <PlatformGrid
              platforms={platforms}
              selected={selected}
              onToggle={toggle}
            />
            <button
              type="button"
              data-testid="continue"
              disabled={!canContinue}
              onClick={() => setStep(2)}
              style={primaryBtn(!canContinue)}
            >
              Continue
            </button>
          </>
        ) : (
          <>
            <p
              style={{
                fontFamily: "Castoro, serif",
                textAlign: "center",
                margin: 0,
                fontSize: "1.15rem",
              }}
            >
              Prompts stay on this computer.
            </p>
            <button
              type="button"
              data-testid="got-it"
              disabled={busy}
              onClick={() => void finish()}
              style={primaryBtn(busy)}
            >
              Got it
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--yale-blue)",
                fontFamily: "Castoro, serif",
                cursor: "pointer",
                opacity: 0.7,
              }}
            >
              Back
            </button>
            {error ? (
              <p style={{ color: "var(--yale-blue)", fontSize: 14 }}>{error}</p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

function primaryBtn(disabled: boolean): CSSProperties {
  return {
    marginTop: 8,
    padding: "10px 28px",
    borderRadius: 999,
    border: "none",
    background: disabled ? "var(--frozen-water)" : "var(--fresh-sky)",
    color: "var(--yale-blue)",
    fontFamily: "Castoro, serif",
    fontSize: "1rem",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}
