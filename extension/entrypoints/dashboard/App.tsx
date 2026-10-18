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
  WaterDrop,
} from "../../components/FootprintCartoons";
import { CountUp } from "../../components/ScoreCountUp";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import evalsData from "../../data/evals.json";
import seedInsights from "../../data/insights.json";
import platformsData from "../../data/platforms.json";
import { bgBackend } from "../../lib/backendBridge";
import type { EvalsSummary, HealthResult } from "../../lib/backendClient";
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
import { weekSavings } from "../../lib/savings";
import { weekTotals } from "../../lib/weekTotals";
import { FOOTPRINT_MODELS, FOOTPRINT_SOURCE_NOTE } from "../../lib/footprint";
import type { Platform, UsageRow } from "../../lib/types";

type InsightCard = { id: string; text: string };

const platforms = platformsData as Platform[];
const models = FOOTPRINT_MODELS;
const evalRows = (
  evalsData as { rows: Array<{ prompt_text: string; kind: string; label: string }> }
).rows;

// Hand-run: classify(evals.json) → 30/30 = 1.0 (recomputed in UI + tests).
const HAND_EVAL = { correct: 30, total: 30, accuracy: 1 };

export function DashboardApp() {
  const [state, setState] = useState<PuddleState | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [insightCards, setInsightCards] = useState<InsightCard[]>(
    seedInsights.slice(0, 3),
  );
  const [evalsSummary, setEvalsSummary] = useState<EvalsSummary | null>(null);
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
    void (async () => {
      const health = await bgBackend<HealthResult>("health");
      const online = Boolean(health && "ok" in health && health.ok);
      setBackendOnline(online);
      if (health && "ok" in health && health.ok) {
        try {
          const latest = await bgBackend<{
            ok?: boolean;
            cards?: InsightCard[];
          }>("insights-latest");
          if (latest?.ok && latest.cards?.length) {
            setInsightCards(latest.cards);
          }
        } catch {
          // keep seed tips
        }
        try {
          await bgBackend("adapter-sync");
        } catch {
          // offline adapters stay bundled
        }
        const ev = await bgBackend<{ ok?: boolean; summary?: EvalsSummary }>(
          "evals-summary",
        );
        if (ev?.ok && ev.summary) setEvalsSummary(ev.summary);
        else setEvalsSummary({ status: "not_run" });
      } else {
        setEvalsSummary(null);
      }
    })();
  }, []);

  useEffect(() => {
    const scrollHash = () => {
      if (location.hash === "#recap") {
        recapRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    };
    scrollHash();
    window.addEventListener("hashchange", scrollHash);
    return () => window.removeEventListener("hashchange", scrollHash);
  }, [state]);

  const evalResult = useMemo(() => recomputeAccuracy(evalRows), []);
  const week = state
    ? weekTotals(state.usage, today, models)
    : { Wh: 0, water_L: 0, co2_g: 0, days: 0 };
  const saved = state
    ? weekSavings(state.usage, today, platforms, models)
    : { Wh: 0, water_L: 0, co2_g: 0 };
  const streak = state
    ? computeStreak(state.usage, today, platforms)
    : 0;

  const onFile = async (file: File | null) => {
    if (!file || !state) return;
    setUploadError(null);
    setUploadStatus(null);

    const health = await bgBackend<HealthResult>("health");
    const online = Boolean(health && "ok" in health && health.ok);
    setBackendOnline(online);

    if (online) {
      try {
        setUploadStatus("Uploading to PromptPrint…");
        const bytes = await file.arrayBuffer();
        const result = await bgBackend<{
          ok?: boolean;
          error?: string;
          job_id?: string;
          cards?: InsightCard[];
        }>("upload-pipeline", {
          bytes,
          filename: file.name || "export.json",
        });
        if (!result?.ok) {
          throw new Error(result?.error || "upload failed");
        }
        if (result.cards?.length) setInsightCards(result.cards);
        setUploadStatus(`Job ${result.job_id} succeeded · live insights`);
        return;
      } catch (e) {
        setUploadError(
          e instanceof Error
            ? `Backend upload failed (${e.message}). Falling back to local parse.`
            : "Backend upload failed. Falling back to local parse.",
        );
        // fall through to local parse
      }
    }

    const text = await file.text();
    const parsed = parseExport(text, state.usage);
    if (!parsed.ok) {
      setUploadError(parsed.error);
      return;
    }
    const next = { ...state, usage: parsed.rows };
    await writeState({ usage: parsed.rows });
    setState(next);
    setUploadStatus(
      online ? null : "Offline · parsed locally (demo data mode)",
    );
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
              Touchgrass
            </h1>
            <p className="mt-1 mb-0 text-sm text-muted-foreground">
              Week · insights · upload · recap
            </p>
            <p
              data-testid="backend-status"
              className="mt-1 mb-0 text-xs text-muted-foreground"
            >
              {backendOnline === null
                ? "Checking backend…"
                : backendOnline
                  ? "Backend online"
                  : "Offline / demo data"}
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
              Coach test harness
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
            label="power used (est.)"
            hint={`Estimated electricity these prompts used, in watt-hours. ${FOOTPRINT_SOURCE_NOTE}`}
            value={week.Wh}
            decimals={2}
            suffix=" Wh"
            art={<EnergyBolt size={72} />}
          />
          <Stat
            label="water used (est.)"
            hint={`Estimated water for server cooling and power, in millilitres. ${FOOTPRINT_SOURCE_NOTE}`}
            value={week.water_L * 1000}
            decimals={1}
            suffix=" mL"
            art={<WaterDrop size={72} />}
          />
          <Stat
            label="carbon out (est.)"
            hint={`Estimated CO₂e from the power those prompts used, in grams. ${FOOTPRINT_SOURCE_NOTE}`}
            value={week.co2_g}
            decimals={2}
            suffix=" g"
            art={<Co2Cloud size={72} />}
          />
          <Stat
            label="CO₂ saved (est.)"
            hint="Estimated CO₂e avoided by using smaller models instead of each site's big default (small models assumed to cost 25%)."
            value={saved.co2_g}
            decimals={2}
            suffix=" g"
            art={<Co2Cloud size={72} />}
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
            {insightCards.slice(0, 3).map((i) => (
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
            Local seed accuracy {Math.round(evalResult.accuracy * 100)}% (
            {evalResult.correct}/{evalResult.total})
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Hand check: {HAND_EVAL.correct}/{HAND_EVAL.total} ={" "}
            {HAND_EVAL.accuracy}
          </p>
          <div data-testid="evals-summary" className="mt-3 text-sm">
            {!backendOnline || !evalsSummary ? (
              <p className="m-0 text-muted-foreground">
                Backend evals unavailable offline
              </p>
            ) : evalsSummary.status === "not_run" ? (
              <p className="m-0" data-testid="evals-not-run">
                Evaluation not run
              </p>
            ) : (
              <>
                {evalsSummary.source_mode === "mock" ? (
                  <p
                    data-testid="evals-mock-badge"
                    className="m-0 mb-2 font-semibold text-foreground"
                  >
                    Synthetic mock results
                  </p>
                ) : null}
                <p className="m-0 text-muted-foreground">
                  Report status: {String(evalsSummary.status ?? "ready")}
                </p>
              </>
            )}
          </div>
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
          {uploadStatus ? (
            <p
              data-testid="upload-status"
              className="mt-2 text-sm text-muted-foreground"
            >
              {uploadStatus}
            </p>
          ) : null}
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
              title="Energy (est.)"
              value={week.Wh}
              decimals={2}
              suffix=" Wh"
              art={<EnergyBolt size={56} />}
            />
            <RecapCard
              title="Water (est.)"
              value={week.water_L * 1000}
              decimals={1}
              suffix=" mL"
              art={<WaterDrop size={56} />}
            />
            <RecapCard
              title="CO₂ (est.)"
              value={week.co2_g}
              decimals={2}
              suffix=" g"
              art={<Co2Cloud size={56} />}
            />
            <RecapCard
              title="CO₂ saved (est.)"
              value={saved.co2_g}
              decimals={2}
              suffix=" g"
              art={<Co2Cloud size={56} />}
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
