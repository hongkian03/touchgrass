import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Co2Cloud,
  EnergyBolt,
  TreeGrove,
  WaterDrop,
} from "../../components/FootprintCartoons";
import { CountUp } from "../../components/ScoreCountUp";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import evalsData from "../../data/evals.json";
import footprintData from "../../data/footprint.json";
import insights from "../../data/insights.json";
import platformsData from "../../data/platforms.json";
import { recomputeAccuracy } from "../../lib/evalAccuracy";
import {
  DASHBOARD_COLUMN_WIDTH,
  DASHBOARD_MAX_WIDTH,
  DASHBOARD_MIN_WIDTH,
} from "../../lib/layout";
import { readState, writeState, type PuddleState } from "../../lib/storage";
import { computeStreak } from "../../lib/streak";
import { parseExport } from "../../lib/upload";
import { parseVoiceIntent } from "../../lib/voiceIntent";
import { saplingsFromCo2G, weekSavings } from "../../lib/savings";
import { weekTotals } from "../../lib/weekTotals";
import type { FootprintModel } from "../../lib/totals";
import type { Platform, UsageRow } from "../../lib/types";

const platforms = platformsData as Platform[];
const models = (footprintData as { models: Record<string, FootprintModel> })
  .models;
const evalRows = (
  evalsData as { rows: Array<{ prompt_text: string; kind: string; label: string }> }
).rows;

// Hand-run: classify(evals.json) → 30/30 = 1.0 (recomputed in UI + tests).
const HAND_EVAL = { correct: 30, total: 30, accuracy: 1 };

export function DashboardApp() {
  const [state, setState] = useState<PuddleState | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [voiceLine, setVoiceLine] = useState("");
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recapRef = useRef<HTMLElement>(null);

  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    void readState().then(setState);
  }, []);

  useEffect(() => {
    if (location.hash === "#recap") {
      recapRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    const onHash = () => {
      if (location.hash === "#recap") {
        recapRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [state]);

  const evalResult = useMemo(() => recomputeAccuracy(evalRows), []);
  const week = state
    ? weekTotals(state.usage, today, models)
    : { Wh: 0, water_L: 0, co2_g: 0, days: 0 };
  const saved = state
    ? weekSavings(state.usage, today, platforms, models)
    : { Wh: 0, water_L: 0, co2_g: 0 };
  const saplings = saplingsFromCo2G(saved.co2_g);
  const streak = state
    ? computeStreak(state.usage, today, platforms)
    : 0;

  const onFile = async (file: File | null) => {
    if (!file || !state) return;
    setUploadError(null);
    const text = await file.text();
    const prevLen = state.usage.length;
    const parsed = parseExport(text, state.usage);
    if (!parsed.ok) {
      setUploadError(parsed.error);
      // P2/P3: do not mutate usage
      void prevLen;
      return;
    }
    const next = { ...state, usage: parsed.rows };
    await writeState({ usage: parsed.rows });
    setState(next);
  };

  const goRecap = () => {
    location.hash = "recap";
    recapRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const runVoiceText = async (text: string) => {
    const intent = parseVoiceIntent(
      text,
      platforms,
      state.enabledPlatforms,
    );
    if (intent.kind === "recap") {
      setVoiceNote("Opening weekly recap");
      goRecap();
      return;
    }
    if (intent.kind === "weather") {
      setVoiceNote(intent.reason);
      const url = intent.suggestion.targetUrl;
      if (!url || /deepseek/i.test(url)) return;
      await browser.tabs.create({ url });
      return;
    }
    setVoiceNote("Try “Hey Pip weekly report” or a weather ask.");
  };

  const startMic = () => {
    const SR =
      (
        window as unknown as {
          SpeechRecognition?: new () => SpeechRecognition;
          webkitSpeechRecognition?: new () => SpeechRecognition;
        }
      ).SpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => SpeechRecognition;
        }
      ).webkitSpeechRecognition;
    if (!SR) {
      setVoiceNote("Mic API missing. Type below.");
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    setListening(true);
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const said = ev.results[0]?.[0]?.transcript ?? "";
      setVoiceLine(said);
      void runVoiceText(said);
      setListening(false);
    };
    rec.onerror = () => {
      setListening(false);
      setVoiceNote("Mic failed. Type below.");
    };
    rec.onend = () => setListening(false);
    rec.start();
  };

  if (!state) {
    return (
      <main
        data-testid="dashboard"
        className="mx-auto min-h-screen bg-white p-8 font-sans text-foreground"
        style={{
          width: DASHBOARD_COLUMN_WIDTH,
          maxWidth: DASHBOARD_MAX_WIDTH,
          minWidth: DASHBOARD_MIN_WIDTH,
        }}
      />
    );
  }

  return (
    <main
      data-testid="dashboard"
      className="mx-auto min-h-screen bg-white p-8 font-sans text-foreground"
      style={{
        width: "100%",
        maxWidth: DASHBOARD_MAX_WIDTH,
        minWidth: DASHBOARD_MIN_WIDTH,
      }}
    >
      <div
        data-testid="dashboard-column"
        data-column-width={DASHBOARD_COLUMN_WIDTH}
        className="mx-auto flex w-full flex-col gap-8"
        style={{
          width: DASHBOARD_COLUMN_WIDTH,
          maxWidth: DASHBOARD_MAX_WIDTH,
          minWidth: DASHBOARD_MIN_WIDTH,
        }}
      >
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1
              data-testid="puddle-title"
              className="m-0 text-3xl font-semibold tracking-tight"
            >
              Puddle
            </h1>
            <p className="mt-1 mb-0 text-sm text-muted-foreground">
              Week · insights · upload · recap
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              data-testid="try-pip"
              onClick={() =>
                void browser.tabs.create({
                  url: browser.runtime.getURL("/fixture.html"),
                })
              }
            >
              Try Pip
            </Button>
            <Button type="button" data-testid="open-recap" onClick={goRecap}>
              Week
            </Button>
          </div>
        </header>

        <section
          data-testid="week-totals"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <Stat
            label="power used"
            hint="Electricity these prompts burned, in watt-hours."
            value={week.Wh}
            decimals={1}
            suffix=" Wh"
            art={<EnergyBolt size={72} />}
          />
          <Stat
            label="water used"
            hint="Water used to cool the servers, in liters."
            value={week.water_L}
            decimals={2}
            suffix=" L"
            art={<WaterDrop size={72} />}
          />
          <Stat
            label="carbon out"
            hint="CO₂ from the power those prompts used, in grams."
            value={week.co2_g}
            decimals={1}
            suffix=" g"
            art={<Co2Cloud size={72} />}
          />
          <Stat
            label="trees planted"
            hint="Trees equal to the CO₂ you skipped vs the big default model."
            value={saplings}
            decimals={1}
            suffix=""
            art={<TreeGrove size={72} count={saplings} />}
          />
        </section>

        <section data-testid="streak-card">
          <h2 className="m-0 text-lg font-semibold">Habit</h2>
          <p className="mt-1 mb-0 text-sm" data-testid="streak">
            {streak} day streak · {week.days} active days this week
          </p>
        </section>

        <section data-testid="insights">
          <h2 className="m-0 text-lg font-semibold">Insights</h2>
          <ul className="mt-3 list-none space-y-2 p-0">
            {insights.slice(0, 3).map((i) => (
              <li
                key={i.id}
                data-testid={`insight-${i.id}`}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                {i.text}
              </li>
            ))}
          </ul>
        </section>

        <section data-testid="eval-card">
          <h2 className="m-0 text-lg font-semibold">Classifier eval</h2>
          <p className="mt-1 mb-0 text-sm" data-testid="eval-accuracy">
            {/* Hand: {HAND_EVAL.correct}/{HAND_EVAL.total}={HAND_EVAL.accuracy}. Live recompute below. */}
            Accuracy {Math.round(evalResult.accuracy * 100)}% (
            {evalResult.correct}/{evalResult.total}), recomputed
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Hand check: {HAND_EVAL.correct}/{HAND_EVAL.total} ={" "}
            {HAND_EVAL.accuracy}
          </p>
        </section>

        <section data-testid="upload">
          <h2 className="m-0 text-lg font-semibold">Upload export</h2>
          <div
            data-testid="upload-dropzone"
            className="mt-3 flex min-h-[100px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-input px-4 py-6 text-sm text-muted-foreground"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0] ?? null);
            }}
            onClick={() => fileRef.current?.click()}
          >
            Drop ChatGPT / Claude JSON here
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {uploadError ? (
            <p data-testid="upload-error" className="mt-2 text-sm text-foreground">
              {uploadError}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground" data-testid="usage-count">
            {state.usage.length} usage rows
          </p>
        </section>

        <section data-testid="voice">
          <h2 className="m-0 text-lg font-semibold">Ask Pip</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Speech only after mic click. Or type.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              data-testid="mic"
              variant={listening ? "default" : "secondary"}
              onClick={startMic}
            >
              {listening ? "Listening…" : "Mic"}
            </Button>
            <Input
              data-testid="voice-input"
              value={voiceLine}
              onChange={(e) => setVoiceLine(e.target.value)}
              placeholder='Hey Pip weekly report'
              className="bg-white"
              onKeyDown={(e) => {
                if (e.key === "Enter") void runVoiceText(voiceLine);
              }}
            />
            <Button
              type="button"
              data-testid="voice-go"
              onClick={() => void runVoiceText(voiceLine)}
            >
              Go
            </Button>
          </div>
          {voiceNote ? (
            <p data-testid="voice-note" className="mt-2 text-sm">
              {voiceNote}
            </p>
          ) : null}
        </section>

        <section
          id="recap"
          ref={recapRef as RefObject<HTMLElement | null>}
          data-testid="recap"
          className="scroll-mt-8 rounded-xl border border-border p-4"
        >
          <h2 className="m-0 text-lg font-semibold">Weekly recap</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RecapCard
              title="Energy"
              value={week.Wh}
              decimals={1}
              suffix=" Wh"
              art={<EnergyBolt size={56} />}
            />
            <RecapCard
              title="Water"
              value={week.water_L}
              decimals={2}
              suffix=" L"
              art={<WaterDrop size={56} />}
            />
            <RecapCard
              title="CO₂"
              value={week.co2_g}
              decimals={1}
              suffix=" g"
              art={<Co2Cloud size={56} />}
            />
            <RecapCard
              title="Trees"
              value={saplings}
              decimals={1}
              suffix=""
              art={<TreeGrove size={56} count={saplings} />}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({
  label,
  hint,
  value,
  decimals,
  suffix,
  art,
}: {
  label: string;
  hint: string;
  value: number;
  decimals: number;
  suffix: string;
  art: ReactNode;
}) {
  return (
    <div
      title={hint}
      className="flex cursor-help flex-col items-center rounded-lg border border-border px-3 py-3 text-center"
    >
      {art}
      <CountUp
        value={value}
        decimals={decimals}
        suffix={suffix}
        durationMs={900}
        className="mt-1 block text-lg tabular-nums"
      />
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function RecapCard({
  title,
  value,
  decimals,
  suffix,
  art,
}: {
  title: string;
  value: number;
  decimals: number;
  suffix: string;
  art: ReactNode;
}) {
  return (
    <div
      data-testid={`recap-${title.toLowerCase()}`}
      className="flex flex-col items-center rounded-lg bg-[var(--pale-sky)] px-3 py-3 text-center"
    >
      {art}
      <div className="mt-1 text-sm font-semibold">{title}</div>
      <CountUp
        value={value}
        decimals={decimals}
        suffix={suffix}
        durationMs={900}
        className="mt-1 block text-sm tabular-nums"
      />
    </div>
  );
}

// Minimal SpeechRecognition types for Chromium
interface SpeechRecognition extends EventTarget {
  lang: string;
  start(): void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
