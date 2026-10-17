import { useEffect, useState } from "react";
import { Pip } from "../../components/Pip";
import { ScoreCountUp } from "../../components/ScoreCountUp";
import { Button } from "../../components/ui/button";
import coachCopy from "../../data/coach-copy.json";
import footprintData from "../../data/footprint.json";
import insights from "../../data/insights.json";
import platformsData from "../../data/platforms.json";
import usageSeed from "../../data/usage-seed.json";
import { POPUP_HEIGHT, POPUP_WIDTH } from "../../lib/layout";
import { score } from "../../lib/score";
import { DEFAULT_STATE, readState, type PuddleState } from "../../lib/storage";
import { computeStreak } from "../../lib/streak";
import { dayTotals, type FootprintModel } from "../../lib/totals";
import type { Platform, UsageRow } from "../../lib/types";

const platforms = platformsData as Platform[];
const models = (footprintData as { models: Record<string, FootprintModel> })
  .models;

export function PopupApp() {
  const [state, setState] = useState<PuddleState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);

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

  const totals = dayTotals(state.usage, new Date(), models);
  const tip = insights[0]?.text ?? coachCopy.oversized;

  const openWeek = () => {
    void browser.tabs
      .create({ url: browser.runtime.getURL("/dashboard.html") })
      .catch(() => {
        window.location.href = "/dashboard.html";
      });
  };

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
      className="relative box-border flex flex-col items-stretch gap-3 overflow-hidden bg-white p-5 font-sans text-foreground"
      style={shell}
    >
      <div className="pip-peek pip-peek--popup" aria-hidden="true">
        <Pip size={84} variant="sticker" tilt={-6} />
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-stretch gap-3 pr-16">
        <h1
          data-testid="puddle-title"
          className="m-0 max-w-[180px] text-2xl font-semibold tracking-tight"
        >
          Puddle
        </h1>
        <ScoreCountUp value={state.score} />
        <p className="m-0 text-sm text-muted-foreground" data-testid="streak">
          {state.streak} day streak
        </p>
        <p
          data-testid="coach-line"
          className="mt-1 max-w-[220px] text-sm leading-snug"
        >
          {tip}
        </p>

        <div className="mt-2 flex gap-4 text-xs">
          <Tick label="energy" value={`${totals.Wh.toFixed(1)} Wh`} />
          <Tick label="water" value={`${totals.water_L.toFixed(2)} L`} />
          <Tick label="CO₂" value={`${totals.co2_g.toFixed(1)} g`} />
        </div>

        <Button
          type="button"
          data-testid="week"
          className="mt-auto min-w-[140px] self-start"
          onClick={openWeek}
        >
          Week
        </Button>
      </div>
    </main>
  );
}

function Tick({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-muted-foreground">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}
