import { useEffect, useRef, useState } from "react";
import coachCopy from "../../data/coach-copy.json";
import platformsData from "../../data/platforms.json";
import { shouldShowCoach } from "../../lib/coach";
import { mountCoach, unmountCoach } from "../../lib/coachMount";
import {
  applyCoachSwitch,
  openCoachPaste,
  planCoachAuto,
} from "../../lib/coachYes";
import { classify } from "../../lib/classify";
import { providerFromHostname } from "../../lib/route";
import { readState, writeState } from "../../lib/storage";
import type { Platform } from "../../lib/types";

const platforms = platformsData as Platform[];
const DEFAULT_DRAFT = "what's the weather in Boston";
const REDIRECT_MS = 3100;
const SWITCH_HOLD_MS = 3300;

export function FixtureApp() {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const modelRef = useRef<HTMLSpanElement>(null);
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [status, setStatus] = useState("loading…");

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    void (async () => {
      const state = await readState();
      if (!alive) return;
      if (!shouldShowCoach(state.lastCoachAt)) {
        setStatus("Coach quiet (recently ran)");
        return;
      }
      const text = (composerRef.current?.value ?? draft).trim();
      if (!text || classify(text, "text") !== "small_ok") {
        setStatus("No coach for this draft");
        return;
      }

      const params = new URLSearchParams(location.search);
      const forceRedirect = params.get("redirect") === "1";
      if (forceRedirect && modelRef.current) {
        modelRef.current.removeAttribute("id");
      }

      const providerParam = params.get("provider");
      const provider =
        (providerParam &&
          platforms.some((p) => p.id === providerParam) &&
          providerParam) ||
        providerFromHostname(location.hostname, platforms) ||
        "chatgpt";
      const platform = platforms.find((p) => p.id === provider);
      const modelLabel = forceRedirect ? null : modelRef.current;
      const model =
        modelLabel?.textContent?.trim() ||
        platform?.defaultModel ||
        "GPT-5";

      const plan = planCoachAuto({
        draft: text,
        model,
        provider,
        modelLabel,
        enabledPlatforms: state.enabledPlatforms,
      });

      if (plan.kind === "switched" && modelLabel) {
        applyCoachSwitch(modelLabel, plan.model);
        setStatus(`Switched to ${plan.model}`);
        mountCoach({
          shadow: false,
          message: coachCopy.switched.replace("{model}", plan.model),
        });
        await writeState({ lastCoachAt: Date.now() });
        timer = window.setTimeout(() => {
          if (alive) unmountCoach();
        }, SWITCH_HOLD_MS);
        return;
      }

      if (plan.kind === "noop") {
        setStatus("No other enabled platform to open");
        return;
      }

      if (plan.kind !== "redirect") return;

      setStatus(`Redirecting to ${plan.target.name}`);
      mountCoach({
        shadow: false,
        message: coachCopy.redirecting.replace("{name}", plan.target.name),
        target: plan.target,
        redirectMeta: {
          reason: plan.suggestion.reason || "Simple ask · lighter model fit",
          fromPlatform: provider,
          savedWh: 1.8,
          savedCo2G: 0.79,
          chalkPill: "Chalk JEV + Router",
          smallOkPct: 94,
          contextTurns: 2,
          sameSiteModel: platform?.smallModel ?? "gpt-4o-mini",
          durationMs: REDIRECT_MS,
          onCancel: () => {
            if (timer) window.clearTimeout(timer);
            unmountCoach();
            setStatus("Stayed on current tab");
          },
          onSwitchSameSite: () => {
            if (timer) window.clearTimeout(timer);
            const targetSmall = platform?.smallModel ?? "gpt-4o-mini";
            if (modelRef.current) {
              applyCoachSwitch(modelRef.current, targetSmall, document);
            }
            unmountCoach();
            setStatus(`Switched to ${targetSmall}`);
          },
          onHopNow: () => {
            if (timer) window.clearTimeout(timer);
            void (async () => {
              try {
                await openCoachPaste({
                  url: plan.url,
                  draft: composerRef.current?.value ?? draft,
                });
                if (alive) setStatus(`Opened ${plan.target.name}`);
              } finally {
                await writeState({ lastCoachAt: Date.now() });
                if (alive) unmountCoach();
              }
            })();
          },
        },
      });

      timer = window.setTimeout(() => {
        void (async () => {
          try {
            await openCoachPaste({
              url: plan.url,
              draft: composerRef.current?.value ?? draft,
            });
            if (alive) setStatus(`Opened ${plan.target.name}`);
          } finally {
            await writeState({ lastCoachAt: Date.now() });
            if (alive) unmountCoach();
          }
        })();
      }, REDIRECT_MS);
    })();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
      unmountCoach();
    };
    // mount once on load. draft edits don't remount coach
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
