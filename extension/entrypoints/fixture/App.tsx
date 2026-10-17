import { useEffect, useRef, useState } from "react";
import coachCopy from "../../data/coach-copy.json";
import { shouldShowCoach } from "../../lib/coach";
import { mountCoach, unmountCoach } from "../../lib/coachMount";
import { runCoachYes } from "../../lib/coachYes";
import { readState, writeState } from "../../lib/storage";

const DEFAULT_DRAFT = "what's the weather in Boston";

export function FixtureApp() {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const modelRef = useRef<HTMLSpanElement>(null);
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [status, setStatus] = useState("loading…");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const state = await readState();
      if (!alive) return;
      if (!shouldShowCoach(state.lastCoachAt)) {
        setStatus("Pip hidden (No within last 10 min)");
        return;
      }
      setStatus("Pip coaching");
      mountCoach({
        shadow: false,
        message: coachCopy.oversized,
        composer: composerRef.current,
        onYes: () => {
          void (async () => {
            const model = modelRef.current?.textContent?.trim() || "GPT-5";
            await runCoachYes({
              draft: composerRef.current?.value ?? draft,
              model,
              provider: "chatgpt",
              modelLabel: modelRef.current,
            });
            unmountCoach();
            setStatus("Yes — routed");
          })();
        },
        onNo: () => {
          void (async () => {
            await writeState({ lastCoachAt: Date.now() });
            unmountCoach();
            setStatus("Pip hidden (No within last 10 min)");
          })();
        },
      });
    })();
    return () => {
      alive = false;
      unmountCoach();
    };
    // mount once on load — draft edits don't remount coach
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main
      data-testid="fixture"
      className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 bg-white p-6 font-sans text-foreground"
    >
      <h1 className="m-0 text-2xl font-semibold tracking-tight">Try Pip</h1>
      <p className="m-0 text-sm text-muted-foreground" data-testid="fixture-status">
        {status}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        <span>
          Model:{" "}
          <span id="model-label" ref={modelRef} data-testid="model-label">
            GPT-5
          </span>
        </span>
      </label>
      <textarea
        id="composer"
        ref={composerRef}
        data-testid="composer"
        className="min-h-[120px] w-full rounded-md border border-input bg-white p-3 text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </main>
  );
}
