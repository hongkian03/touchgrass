import coachCopy from "../data/coach-copy.json";
import platformsData from "../data/platforms.json";
import {
  missingSelectorKeys,
  queryBySelector,
  type SiteAdapter,
} from "../lib/adapter";
import { bgBackend } from "../lib/backendBridge";
import { readBackendConfig } from "../lib/backendClient";
import {
  COACH_TYPE_DEBOUNCE_MS,
  shouldShowCoach,
} from "../lib/coach";
import { allPlatformMatchPatterns } from "../lib/coachInject";
import { mountCoach, unmountCoach } from "../lib/coachMount";
import { applyCoachSwitch, openCoachPaste } from "../lib/coachYes";
import { coachTargetDisplay } from "../lib/coachTargetDisplay";
import {
  DraftCoach,
  type CoachClassifyResponse,
  type CoachDraft,
} from "../lib/draftCoach";
import { draftFrom, findComposer } from "../lib/findComposer";
import type { GroqRouteResult } from "../lib/groqRoute";
import { providerFromHostname, urlForPlatformId } from "../lib/route";
import { resolveActiveSite } from "../lib/siteDetect";
import { readState, writeState } from "../lib/storage";
import type { Platform } from "../lib/types";

const platforms = platformsData as Platform[];
const REDIRECT_MS = 1600;
const MISS_THRESHOLD = 3;

function uuid(): string {
  return crypto.randomUUID();
}

export default defineContentScript({
  matches: allPlatformMatchPatterns(),
  registration: "runtime",
  main() {
    bootWatch();
  },
});

function bootWatch() {
  const flag = "__puddleCoachWatch";
  const w = window as unknown as Record<string, boolean>;
  if (w[flag]) return;
  w[flag] = true;

  let debounceTimer: number | undefined;
  let acting = false;
  let bound: HTMLTextAreaElement | HTMLElement | null = null;
  let adapter: SiteAdapter | null = null;
  let missStreak = 0;
  let repairInFlight = false;
  let draftRevision = 0;
  let holdBound = false;
  let pendingRelease: (() => void) | null = null;
  let lastRoutedDraft = "";
  /** Groq/cross-site toast up — chalk must not unmount it. */
  let redirectToastActive = false;
  let activeSite: string | null =
    providerFromHostname(location.hostname, platforms) ?? null;

  const runCrossSiteRedirect = async (
    draftText: string,
    provider: string,
    enabled: string[],
    composer: HTMLTextAreaElement | HTMLElement,
  ): Promise<boolean> => {
    const result = (await browser.runtime.sendMessage({
      type: "puddle/route-query",
      draft: draftText,
      provider,
      enabledPlatforms: enabled,
    })) as GroqRouteResult;

    if (!result?.ok) {
      console.warn("[Touchgrass] Groq route failed", result);
      return false;
    }
    if (result.platformId === provider) {
      console.log(
        `[Touchgrass] stay on ${provider} (${result.reason})`,
      );
      lastRoutedDraft = draftText;
      return false;
    }
    const url = urlForPlatformId(result.platformId, platforms);
    if (!url) {
      console.warn("[Touchgrass] no URL for", result.platformId);
      return false;
    }

    lastRoutedDraft = draftText;
    redirectToastActive = true;
    const target = coachTargetDisplay(url, platforms);
    console.log(
      `[Touchgrass] redirect → ${result.platformId} (${result.reason})`,
    );
    mountCoach({
      shadow: true,
      message: coachCopy.redirecting.replace("{name}", target.name),
      target,
    });

    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), REDIRECT_MS);
    });

    try {
      await openCoachPaste({
        url,
        draft: draftFrom(composer),
      });
      return true;
    } finally {
      await writeState({ lastCoachAt: Date.now() });
      redirectToastActive = false;
      unmountCoach();
    }
  };

  const ensureSite = async (): Promise<string | null> => {
    if (activeSite) return activeSite;
    const resolved = await resolveActiveSite(location.hostname);
    if (!resolved) return null;
    activeSite = resolved.site;
    console.log(
      `[Touchgrass] site=${activeSite} via=${resolved.via}${
        resolved.label ? ` (${resolved.label})` : ""
      }`,
    );
    return activeSite;
  };

  const loadAdapter = async () => {
    const site = await ensureSite();
    if (!site) return;
    const res = await bgBackend<{ ok?: boolean; adapter?: SiteAdapter | null }>(
      "adapter-get",
      { site },
    );
    adapter = res?.adapter ?? null;
    if (adapter) {
      console.log(`[Touchgrass] adapter v${adapter.version} (${adapter.site})`);
    }
  };

  void loadAdapter();

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === "touchgrass/adapter-updated" && message.adapter) {
      adapter = message.adapter as SiteAdapter;
      console.log(
        `[Touchgrass] adapter updated to v${adapter.version}`,
      );
      missStreak = 0;
    }
  });

  const modelLabelEl = (): HTMLElement | null => {
    if (adapter?.selectors.model_name) {
      const el = queryBySelector(adapter.selectors.model_name);
      if (el) return el;
    }
    return document.querySelector<HTMLElement>(
      "#model-label, [data-testid='model-switcher'], [data-testid='model-selector']",
    );
  };

  const composerForSite = (): HTMLTextAreaElement | HTMLElement | null => {
    const preferred = adapter?.selectors.prompt_box
      ? [adapter.selectors.prompt_box]
      : [];
    return findComposer(document, preferred);
  };

  const maybeReportMiss = async () => {
    if (!adapter || repairInFlight) return;
    // Only sites with a published adapter can call Mechanic repair.
    const site = await ensureSite();
    if (!site || adapter.site !== site) return;
    const missing = missingSelectorKeys(adapter, document, [
      "prompt_box",
      "send_button",
    ]);
    if (!missing.length) {
      missStreak = 0;
      return;
    }
    missStreak += 1;
    if (missStreak < MISS_THRESHOLD) return;
    repairInFlight = true;
    missStreak = 0;
    try {
      const result = await bgBackend<{
        ok?: boolean;
        adapter?: SiteAdapter | null;
        ignored?: boolean;
      }>("adapter-repair", {
        report: {
          site: adapter.site,
          failed_keys: missing,
          adapter_version: adapter.version,
          snapshot_html: document.documentElement.outerHTML.slice(0, 200_000),
          adapter,
          expected_prompt: (() => {
            const c = composerForSite();
            return c ? draftFrom(c).slice(0, 500) : null;
          })(),
        },
      });
      if (result?.adapter) {
        adapter = result.adapter;
        console.log(
          `[Touchgrass] adapter updated to v${adapter.version}`,
        );
      }
    } catch (e) {
      console.warn("[Touchgrass] adapter repair failed", e);
    } finally {
      repairInFlight = false;
    }
  };

  const emitEvent = async (
    eventType: string,
    response: CoachClassifyResponse,
  ) => {
    await bgBackend("coaching-event", {
      event: {
        event_id: uuid(),
        decision_id: response.decision_id,
        draft_revision: response.draft_revision,
        event_type: eventType,
      },
    });
  };

  const chalkCoach = new DraftCoach({
    holdMs: 800,
    classifyTimeoutMs: 5000,
    classify: async (draft, signal) => {
      const res = await bgBackend<{
        ok?: boolean;
        response?: CoachClassifyResponse;
        error?: string;
      }>("classify", { draft });
      if (signal.aborted) throw new Error("aborted");
      if (!res?.ok || !res.response) throw new Error(res?.error || "classify");
      return res.response;
    },
    emit: (eventType, response) => void emitEvent(eventType, response),
    display: (response) => {
      // Never wipe an in-flight cross-site redirect toast
      if (!response) {
        if (!redirectToastActive) unmountCoach();
        return;
      }
      if (redirectToastActive) return;

      const label =
        response.target &&
        typeof response.target === "object" &&
        "website_label" in response.target
          ? String(
              (response.target as { website_label?: string }).website_label ||
                "smaller model",
            )
          : "smaller model";
      const badge =
        response.mode === "mock" ? "Synthetic mock results" : null;
      mountCoach({
        shadow: true,
        message: `Try ${label} for this ask.`,
        actions: {
          badge,
          switchLabel: `Switch to ${label}`,
          onSwitch: () => {
            void (async () => {
              chalkCoach.safeEmit("switch_clicked", response);
              const modelEl = modelLabelEl();
              const targetModel =
                response.target &&
                typeof response.target === "object" &&
                "model_id" in response.target
                  ? String(
                      (response.target as { model_id?: string }).model_id || "",
                    )
                  : "";
              if (modelEl && targetModel) {
                applyCoachSwitch(modelEl, targetModel);
                chalkCoach.safeEmit("switch_confirmed", response);
              }
              chalkCoach.armBypass();
              unmountCoach();
              pendingRelease?.();
              pendingRelease = null;
            })();
          },
          onSendAnyway: () => {
            chalkCoach.safeEmit("sent_anyway", response);
            chalkCoach.armBypass();
            chalkCoach.invalidate();
            unmountCoach();
            pendingRelease?.();
            pendingRelease = null;
          },
        },
      });
    },
  });

  const buildDraft = async (
    text: string,
    model: string,
  ): Promise<CoachDraft | null> => {
    const cfg = await readBackendConfig();
    if (!cfg.sessionToken) return null;
    const site = await ensureSite();
    if (!site) return null;
    draftRevision += 1;
    return {
      request_id: uuid(),
      draft_revision: draftRevision,
      conversation_id: location.pathname || "chat",
      site,
      current_model_label: model,
      prompt_text: text.slice(0, 12000),
      recent_messages: [],
      context_available: true,
      context_truncated: false,
      has_attachments: false,
      uses_tools: false,
      modality: "text",
      target_available: true,
      opted_in: true,
    };
  };

  const bindHold = () => {
    if (holdBound) return;
    holdBound = true;
    document.addEventListener(
      "click",
      (ev) => {
        void (async () => {
          const t = ev.target as Element | null;
          if (!t) return;
          const sendSel = adapter?.selectors.send_button;
          let sendBtn: Element | null = null;
          try {
            sendBtn = sendSel
              ? t.closest(sendSel)
              : t.closest(
                  "button[type='submit'], button[aria-label='Send'], button[aria-label='Send message'], button[data-testid='send-button']",
                );
          } catch {
            sendBtn = t.closest(
              "button[type='submit'], button[aria-label='Send']",
            );
          }
          if (!sendBtn) return;
          const cfg = await readBackendConfig();
          if (!cfg.sessionToken || !cfg.backendEnabled) return;
          const site = await ensureSite();
          if (!site) return;
          if (chalkCoach.bypassHoldOnce) {
            chalkCoach.bypassHoldOnce = false;
            return;
          }
          ev.preventDefault();
          ev.stopImmediatePropagation();
          const composer = composerForSite();
          if (!composer) return;
          const text = draftFrom(composer).trim();
          const model =
            modelLabelEl()?.textContent?.trim() ||
            platforms.find((p) => p.id === site)?.defaultModel ||
            "default";
          const draft = await buildDraft(text, model);
          if (!draft) return;
          pendingRelease = () => {
            chalkCoach.armBypass();
            (sendBtn as HTMLElement).click();
          };
          const ready = await chalkCoach.holdSend(draft);
          if (!ready) {
            // timeout / no suggestion → release original send
            const release = pendingRelease;
            pendingRelease = null;
            release?.();
          }
          // if ready, toast shows Switch / Send anyway
        })();
      },
      true,
    );
  };

  const schedule = () => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      void maybeCoach();
    }, COACH_TYPE_DEBOUNCE_MS);
  };

  const maybeCoach = async () => {
    if (acting || redirectToastActive) return;
    void maybeReportMiss();
    const composer = composerForSite();
    if (!composer) {
      console.warn("[Touchgrass] no composer found");
      return;
    }
    ensureBound(composer);
    bindHold();

    const text = draftFrom(composer).trim();
    if (!text || text.length < 8) return;

    const state = await readState();
    if (!shouldShowCoach(state.lastCoachAt)) {
      console.log("[Touchgrass] coach cooldown — wait ~1 min");
      return;
    }
    if (text === lastRoutedDraft) return;

    const enabled = state.enabledPlatforms.filter(Boolean);
    if (enabled.length === 0) {
      console.warn("[Touchgrass] no enabledPlatforms — re-run onboarding");
      return;
    }

    const provider =
      (await ensureSite()) ||
      providerFromHostname(location.hostname, platforms) ||
      "chatgpt";

    acting = true;
    try {
      // Cross-site redirect first (works on Claude/Gemini/etc., Opus or not).
      // Backend same-site Switch still available on Send via hold.
      const redirected = await runCrossSiteRedirect(
        text,
        provider,
        enabled,
        composer,
      );

      const cfg = await readBackendConfig();
      if (
        !redirected &&
        cfg.sessionToken &&
        cfg.backendEnabled &&
        !redirectToastActive
      ) {
        const model =
          modelLabelEl()?.textContent?.trim() ||
          platforms.find((p) => p.id === provider)?.defaultModel ||
          "default";
        const chalkDraft = await buildDraft(text, model);
        if (chalkDraft) chalkCoach.update(chalkDraft);
      }
    } catch (e) {
      console.warn("[Touchgrass] coach route error", e);
    } finally {
      acting = false;
    }
  };

  const ensureBound = (composer: HTMLTextAreaElement | HTMLElement) => {
    if (bound === composer) return;
    if (bound) {
      bound.removeEventListener("input", schedule);
      bound.removeEventListener("keyup", schedule);
    }
    bound = composer;
    bound.addEventListener("input", schedule);
    bound.addEventListener("keyup", schedule);
  };

  const attach = () => {
    const composer = composerForSite();
    if (composer) ensureBound(composer);
    void maybeReportMiss();
  };

  attach();
  const mo = new MutationObserver(() => attach());
  mo.observe(document.documentElement, { childList: true, subtree: true });
}
