import { useEffect, useState, type CSSProperties } from "react";
import { Pip } from "../../components/Pip";
import { ScoreCountUp } from "../../components/ScoreCountUp";
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

function shellStyle(): CSSProperties {
  return {
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    boxSizing: "border-box",
    background: "var(--pale-sky)",
    color: "var(--yale-blue)",
    padding: "20px 18px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    fontFamily: "Castoro, serif",
  };
}

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
        // Local preview (http) has no extension APIs — show seed demo.
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

  if (!ready) {
    return <div data-testid="popup" style={shellStyle()} />;
  }

  return (
    <main data-testid="popup" style={shellStyle()}>
      <Pip size={72} />
      <h1
        data-testid="puddle-title"
        style={{ margin: 0, fontSize: "1.5rem", fontWeight: 400 }}
      >
        Puddle
      </h1>
      <ScoreCountUp value={state.score} />
      <p style={{ margin: 0, opacity: 0.8 }} data-testid="streak">
        {state.streak} day streak
      </p>
      <p
        data-testid="coach-line"
        style={{
          margin: "4px 0 0",
          textAlign: "center",
          fontSize: "0.95rem",
          lineHeight: 1.35,
          maxWidth: 300,
        }}
      >
        {tip}
      </p>

      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 8,
          fontSize: "0.8rem",
        }}
      >
        <Tick label="energy" value={`${totals.Wh.toFixed(1)} Wh`} />
        <Tick label="water" value={`${totals.water_L.toFixed(2)} L`} />
        <Tick label="CO₂" value={`${totals.co2_g.toFixed(1)} g`} />
      </div>

      <button
        type="button"
        data-testid="week"
        onClick={openWeek}
        style={{
          marginTop: "auto",
          padding: "10px 32px",
          borderRadius: 999,
          border: "none",
          background: "var(--fresh-sky)",
          color: "var(--yale-blue)",
          fontFamily: "Castoro, serif",
          fontSize: "1rem",
          cursor: "pointer",
        }}
      >
        Week
      </button>
    </main>
  );
}

function Tick({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ opacity: 0.65 }}>{label}</div>
      <div style={{ fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
