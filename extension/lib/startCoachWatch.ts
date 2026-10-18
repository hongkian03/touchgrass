import coachCopy from "../data/coach-copy.json";
import footprintData from "../data/footprint.json";
import platformsData from "../data/platforms.json";
import {
  missingSelectorKeys,
  queryBySelector,
  type SiteAdapter,
} from "./adapter";
import { bgBackend } from "./backendBridge";
import { readBackendConfig } from "./backendClient";
import { COACH_TYPE_DEBOUNCE_MS, shouldShowCoach } from "./coach";
import { mountCoach, unmountCoach } from "./coachMount";
import { applyCoachSwitch, openCoachPaste, scrapeRecentMessages } from "./coachYes";
import { coachTargetDisplay } from "./coachTargetDisplay";
import {
  DraftCoach,
  type CoachClassifyResponse,
  type CoachDraft,
} from "./draftCoach";
import { draftFrom, findComposer } from "./findComposer";
import type { GroqRouteResult } from "./groqRoute";
import { providerFromHostname, urlForPlatformId } from "./route";
import { resolveActiveSite } from "./siteDetect";
import {
  appendUsage,
  isExtensionContextAlive,
  isExtensionContextError,
  isExtensionStorageAlive,
  readState,
  writeState,
} from "./storage";
import type { FootprintModel } from "./totals";
import type { Platform, PromptKind } from "./types";

const platforms = platformsData as Platform[];
const footprintModels = (
  footprintData as { models: Record<string, FootprintModel> }
).models;
/** Auto-hop / progress-bar window — give the user time to Stay / Hop / same-site switch. */
const REDIRECT_MS = 3100;
const MISS_THRESHOLD = 3;

function estimateHopSavings(
  fromProvider: string,
  toPlatformId: string,
): { savedWh: number; savedCo2G: number; savedWaterMl: number } {
  const fromPlat = platforms.find((p) => p.id === fromProvider);
  const toPlat = platforms.find((p) => p.id === toPlatformId);
  const fromModel =
    footprintModels[fromPlat?.defaultModel ?? "gpt-5"] ??
    footprintModels["gpt-5"];
  const toModel =
    footprintModels[
      toPlat?.smallModel ?? toPlat?.defaultModel ?? "gemini-flash"
    ] ?? footprintModels["gemini-flash"];
  if (!fromModel || !toModel) {
    return { savedWh: 1.8, savedCo2G: 0.8, savedWaterMl: 28 };
  }
  return {
    savedWh: Math.max(0.2, fromModel.Wh - toModel.Wh),
    savedCo2G: Math.max(0.05, fromModel.co2_g - toModel.co2_g),
    savedWaterMl: Math.max(2, (fromModel.water_L - toModel.water_L) * 1000),
  };
}

const ATTACHMENT_SELECTOR = [
  "img[src^='blob:']",
  "img[src^='data:']",
  "[data-testid*='attachment' i]",
  "[data-testid*='file-thumbnail' i]",
  "button[aria-label*='Remove file' i]",
  "button[aria-label*='Remove image' i]",
  "button[aria-label*='Remove attachment' i]",
].join(", ");
const SMALL_MODEL_RE = /mini|haiku|flash|lite|nano|instant|small|fast/i;
const IMAGE_GEN_RE =
  /\b(generate|create|make|draw|paint|render|design)\b.{0,40}\b(image|picture|photo|illustration|drawing|logo|poster|art)\b/i;
const VIDEO_GEN_RE =
  /\b(generate|create|make|render|animate)\b.{0,40}\b(video|clip|animation|movie)\b/i;
const REGENERATE_RE = /regenerate|retry|try again|redo/i;

function uuid(): string {
  return crypto.randomUUID();
}

function isComposerTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t instanceof HTMLTextAreaElement) return true;
  if (t.isContentEditable) return true;
  return Boolean(t.closest?.('[contenteditable="true"], textarea'));
}

function findSendButton(from: Element | null): Element | null {
  if (!from) {
    return document.querySelector(
      "button[data-testid='send-button'], button[aria-label='Send'], button[aria-label='Send message'], button[type='submit']",
    );
  }
  try {
    return (
      from.closest(
        "button[type='submit'], button[aria-label='Send'], button[aria-label='Send message'], button[data-testid='send-button']",
      ) ?? null
    );
  } catch {
    return from.closest("button[type='submit'], button[aria-label='Send']");
  }
}

/** Live coach: document capture listeners + Groq hop + chalk hold. */
export function startCoachWatch(): void {
  const flag = "__puddleCoachWatch";
  const w = window as unknown as Record<string, boolean>;
  if (w[flag]) return;
  w[flag] = true;

  let debounceTimer: number | undefined;
  let acting = false;
  let adapter: SiteAdapter | null = null;
  let missStreak = 0;
  let repairInFlight = false;
  let draftRevision = 0;
  let holdBound = false;
  let pendingRelease: (() => void) | null = null;
  let lastRoutedDraft = "";
  /** One-shot: let Enter/Send through after we decided stay. */
  let sendBypassOnce = false;
  /** Groq/cross-site toast up — chalk must not unmount it. */
  let redirectToastActive = false;
  /** Extension was reloaded; chrome.runtime is a dead binding. */
  let contextDead = false;
  const mo = new MutationObserver(() => {
    swallow(maybeReportMiss());
  });

  const markContextDead = () => {
    if (contextDead) return;
    contextDead = true;
    clearDebounce();
    mo.disconnect();
  };

  const contextOk = (): boolean => {
    if (contextDead) return false;
    if (isExtensionContextAlive()) return true;
    markContextDead();
    return false;
  };

  const swallow = (p: Promise<unknown>) => {
    void p.catch((e) => {
      if (isExtensionContextError(e)) {
        markContextDead();
        return;
      }
      console.warn("[Touchgrass] coach error", e);
    });
  };
  let activeSite: string | null =
    providerFromHostname(location.hostname, platforms) ?? null;

  console.log(
    `[Touchgrass] watching ${activeSite ?? location.hostname}`,
  );

  const clearDebounce = () => {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
  };

  const runCrossSiteRedirect = async (
    draftText: string,
    provider: string,
    enabled: string[],
  ): Promise<boolean> => {
    let result: GroqRouteResult;
    try {
      if (!contextOk()) return false;
      result = (await browser.runtime.sendMessage({
        type: "puddle/route-query",
        draft: draftText,
        provider,
        enabledPlatforms: enabled,
      })) as GroqRouteResult;
    } catch (e) {
      if (isExtensionContextError(e)) {
        markContextDead();
        return false;
      }
      throw e;
    }

    console.log(
      `[Touchgrass] route ${JSON.stringify({
        ok: result?.ok ?? false,
        platformId:
          result && "platformId" in result ? result.platformId : undefined,
        error: result && "error" in result ? result.error : undefined,
      })}`,
    );

    if (!result?.ok) {
      const err =
        result && "error" in result ? result.error : "no_response";
      console.warn(`[Touchgrass] Groq route failed: ${err}`);
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
    const savings = estimateHopSavings(provider, result.platformId);
    const recentTurns = scrapeRecentMessages(document, 4, 2400);
    const currentPlat = platforms.find((p) => p.id === provider);
    console.log(
      `[Touchgrass] redirect → ${result.platformId} (${result.reason})`,
    );

    let cancelled = false;
    let resolveWait: (() => void) | null = null;
    let timerId: number | undefined;

    mountCoach({
      shadow: true,
      message: coachCopy.redirecting.replace("{name}", target.name),
      target,
      redirectMeta: {
        reason: result.reason,
        fromPlatform: provider,
        savedWh: savings.savedWh,
        savedCo2G: savings.savedCo2G,
        savedWaterMl: savings.savedWaterMl,
        contextTurns: recentTurns.length,
        durationMs: REDIRECT_MS,
        onCancel: () => {
          cancelled = true;
          if (timerId) window.clearTimeout(timerId);
          resolveWait?.();
        },
        onHopNow: () => {
          if (timerId) window.clearTimeout(timerId);
          resolveWait?.();
        },
      },
    });

    await new Promise<void>((resolve) => {
      resolveWait = resolve;
      timerId = window.setTimeout(() => resolve(), REDIRECT_MS);
    });

    if (cancelled) {
      redirectToastActive = false;
      unmountCoach();
      return false;
    }

    try {
      // Use captured draft + multi-turn context carryover
      await openCoachPaste({
        url,
        draft: draftText,
        recentMessages: recentTurns,
        fromProvider: currentPlat?.name ?? provider,
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

  swallow(
    ensureSite().then((site) => {
      if (site) console.log(`[Touchgrass] watching ${site}`);
    }),
  );

  const loadAdapter = async () => {
    if (!contextOk()) return;
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

  swallow(loadAdapter());

  try {
    if (contextOk()) {
      browser.runtime.onMessage.addListener((message) => {
        if (message?.type === "touchgrass/adapter-updated" && message.adapter) {
          adapter = message.adapter as SiteAdapter;
          console.log(
            `[Touchgrass] adapter updated to v${adapter.version}`,
          );
          missStreak = 0;
        }
      });
    }
  } catch (e) {
    if (isExtensionContextError(e)) markContextDead();
    else throw e;
  }

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
    if (!contextOk() || !adapter || repairInFlight) return;
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
    holdMs: 2300,
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
    emit: (eventType, response) => swallow(emitEvent(eventType, response)),
    display: (response) => {
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
      const siteId = response.site || activeSite || "chatgpt";
      const savings = estimateHopSavings(siteId, siteId);
      const elapsedMs =
        typeof (response as { elapsed_ms?: number }).elapsed_ms === "number"
          ? (response as { elapsed_ms?: number }).elapsed_ms!
          : null;
      const smallOkProb =
        typeof (response as { small_ok?: number }).small_ok === "number" &&
        (response as { small_ok?: number }).small_ok! > 0
          ? Math.round((response as { small_ok?: number }).small_ok! * 100)
          : 94;
      const confPct =
        typeof (response as { confidence?: number }).confidence === "number" &&
        (response as { confidence?: number }).confidence! > 0
          ? Math.round((response as { confidence?: number }).confidence! * 100)
          : smallOkProb;
      mountCoach({
        shadow: true,
        message: `Try ${label} for this ask.`,
        actions: {
          badge,
          switchLabel: `Switch to ${label}`,
          chalkMeta: {
            confidencePct: confPct,
            smallOkPct: smallOkProb,
            elapsedMs,
            policyVersion: response.policy_version ?? null,
            featureGroup:
              (response as { chalk_feature_group?: string })
                .chalk_feature_group ?? "coaching.session_v2",
            savedWh: savings.savedWh,
            savedCo2G: savings.savedCo2G,
          },
          onSwitch: () => {
            swallow((async () => {
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
            })());
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
    const recentTurns = scrapeRecentMessages(document, 4, 2400);
    return {
      request_id: uuid(),
      draft_revision: draftRevision,
      conversation_id: location.pathname || "chat",
      site,
      current_model_label: model,
      prompt_text: text.slice(0, 12000),
      recent_messages: recentTurns,
      context_available: true,
      context_truncated: false,
      has_attachments: false,
      uses_tools: false,
      modality: "text",
      target_available: true,
      opted_in: true,
    };
  };

  /** Groq hop on send. Returns true if hopped (Claude send stays blocked). */
  const tryHopOnSend = async (text: string): Promise<boolean> => {
    if (acting || redirectToastActive) return false;
    if (!text || text.length < 8) return false;
    if (text === lastRoutedDraft) return false;
    if (!contextOk() || !isExtensionStorageAlive()) return false;

    let state;
    try {
      state = await readState();
    } catch (e) {
      if (isExtensionContextError(e)) return false;
      throw e;
    }
    if (!shouldShowCoach(state.lastCoachAt)) {
      console.log("[Touchgrass] coach cooldown — wait ~1 min");
      return false;
    }

    const enabled = state.enabledPlatforms.filter(Boolean);
    if (enabled.length === 0) {
      console.warn("[Touchgrass] no enabledPlatforms — re-run onboarding");
      return false;
    }

    const provider =
      (await ensureSite()) ||
      providerFromHostname(location.hostname, platforms) ||
      "chatgpt";

    acting = true;
    try {
      return await runCrossSiteRedirect(text, provider, enabled);
    } catch (e) {
      if (isExtensionContextError(e)) {
        markContextDead();
        return false;
      }
      console.warn("[Touchgrass] coach route error", e);
      return false;
    } finally {
      acting = false;
    }
  };

  /** Images/files sitting in the composer, counted before the site clears them. */
  const countAttachments = (): number => {
    let box: Element | null = composerForSite();
    for (let i = 0; box && i < 6; i++) {
      if (box.tagName === "FORM" || box.tagName === "FIELDSET") break;
      box = box.parentElement;
    }
    if (!box) return 0;
    return box.querySelectorAll(ATTACHMENT_SELECTOR).length;
  };

  /** Map the page's model picker to footprint.json keys: small label → smallModel. */
  const footprintModelFor = (platform: Platform): string => {
    const label = modelLabelEl()?.textContent?.trim() ?? "";
    return SMALL_MODEL_RE.test(label)
      ? platform.smallModel
      : platform.defaultModel;
  };

  let lastSentText = "";

  /** Log a prompt the site actually sends (text, uploads, image/video asks). */
  const recordSend = async (text: string, regenerated = false) => {
    // Sync: read the composer before the site clears it
    const attachments = regenerated ? 0 : countAttachments();
    if (!text && !attachments && !regenerated) return;
    try {
      const site = await ensureSite();
      const platform = platforms.find((p) => p.id === site);
      if (!site || !platform) return;
      let kind: PromptKind = "text";
      let model = footprintModelFor(platform);
      if (platform.kind === "image" || platform.kind === "video") {
        kind = platform.kind;
        model = platform.defaultModel;
      } else if (VIDEO_GEN_RE.test(text)) {
        kind = "video";
        model = "video-gen";
      } else if (IMAGE_GEN_RE.test(text)) {
        kind = "image";
        model = "dall-e-3";
      }
      if (!regenerated) lastSentText = text;
      await appendUsage({
        ts: new Date().toISOString(),
        provider: site,
        model,
        kind,
        prompt_text: text.slice(0, 2000),
        regenerated,
        ...(attachments ? { attachments } : {}),
      });
      console.log(
        `[Touchgrass] recorded ${regenerated ? "regenerate" : kind} on ${site} (${model}${
          attachments ? `, ${attachments} attachment(s)` : ""
        })`,
      );
    } catch (e) {
      console.warn("[Touchgrass] record usage failed", e);
    }
  };

  // Regenerate / retry buttons: same prompt, answered again
  document.addEventListener(
    "click",
    (ev) => {
      const btn = (ev.target as Element | null)?.closest?.(
        "button, [role='menuitem']",
      );
      if (!btn) return;
      const label = [
        btn.getAttribute("aria-label"),
        btn.getAttribute("data-testid"),
        (btn.textContent ?? "").slice(0, 40),
      ].join(" ");
      if (!REGENERATE_RE.test(label)) return;
      swallow(recordSend(lastSentText, true));
    },
    true,
  );

  const releaseSend = (sendBtn: Element | null, text: string) => {
    swallow(recordSend(text));
    sendBypassOnce = true;
    if (sendBtn instanceof HTMLElement) {
      sendBtn.click();
      return;
    }
    const fallback = findSendButton(null);
    if (fallback instanceof HTMLElement) {
      fallback.click();
      return;
    }
    // No send button — re-fire Enter into composer
    const composer = composerForSite();
    if (composer) {
      composer.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  };

  const bindHold = () => {
    if (holdBound) return;
    holdBound = true;
    document.addEventListener(
      "click",
      (ev) => {
        swallow((async () => {
          if (!contextOk()) return;
          const t = ev.target as Element | null;
          if (!t) return;
          const sendSel = adapter?.selectors.send_button;
          let sendBtn: Element | null = null;
          try {
            sendBtn = sendSel
              ? t.closest(sendSel)
              : findSendButton(t);
          } catch {
            sendBtn = t.closest(
              "button[type='submit'], button[aria-label='Send']",
            );
          }
          if (!sendBtn) return;

          if (sendBypassOnce) {
            sendBypassOnce = false;
            return;
          }
          if (chalkCoach.bypassHoldOnce) {
            chalkCoach.bypassHoldOnce = false;
            return;
          }

          const composer = composerForSite();
          if (!composer) return;
          const text = draftFrom(composer).trim();
          if (text.length < 8) {
            // Short text or image-only send: let the site send, just log it
            swallow(recordSend(text));
            return;
          }

          // Always stop Claude first — draft still in box
          ev.preventDefault();
          ev.stopImmediatePropagation();
          clearDebounce();

          const hopped = await tryHopOnSend(text);
          if (hopped) return;

          // Chalk same-site hold when backend session exists
          const cfg = await readBackendConfig();
          const site = await ensureSite();
          if (cfg.sessionToken && cfg.backendEnabled && site) {
            const model =
              modelLabelEl()?.textContent?.trim() ||
              platforms.find((p) => p.id === site)?.defaultModel ||
              "default";
            const draft = await buildDraft(text, model);
            if (draft) {
              pendingRelease = () => {
                swallow(recordSend(text));
                chalkCoach.armBypass();
                sendBypassOnce = true;
                (sendBtn as HTMLElement).click();
              };
              const ready = await chalkCoach.holdSend(draft);
              if (!ready) {
                const release = pendingRelease;
                pendingRelease = null;
                release?.();
              }
              return;
            }
          }

          // Stay / no hop → let Claude send
          releaseSend(sendBtn, text);
        })());
      },
      true,
    );
  };

  const schedule = () => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      swallow(maybeCoach());
    }, COACH_TYPE_DEBOUNCE_MS);
  };

  const maybeCoach = async () => {
    if (acting || redirectToastActive || !contextOk()) return;
    swallow(maybeReportMiss());
    const composer = composerForSite();
    if (!composer) {
      console.warn("[Touchgrass] no composer found");
      return;
    }
    bindHold();

    const text = draftFrom(composer).trim();
    if (!text || text.length < 8) return;
    if (!isExtensionStorageAlive()) return;

    let state;
    try {
      state = await readState();
    } catch (e) {
      if (isExtensionContextError(e)) return;
      throw e;
    }
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
      const redirected = await runCrossSiteRedirect(text, provider, enabled);

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
      if (isExtensionContextError(e)) {
        markContextDead();
        return;
      }
      console.warn("[Touchgrass] coach route error", e);
    } finally {
      acting = false;
    }
  };

  // Capture-phase Enter: route before Claude clears the box
  document.addEventListener(
    "keydown",
    (ev) => {
      if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing) return;
      if (!isComposerTarget(ev.target)) return;
      if (sendBypassOnce) {
        sendBypassOnce = false;
        return;
      }

      const composer = composerForSite();
      if (!composer) return;
      const text = draftFrom(composer).trim();
      if (text.length < 8) {
        // Short text or image-only send: let the site send, just log it
        swallow(recordSend(text));
        return;
      }

      // Sync stop — Claude must not clear before we route
      ev.preventDefault();
      ev.stopImmediatePropagation();
      clearDebounce();
      bindHold();

      swallow((async () => {
        if (!contextOk()) return;
        const hopped = await tryHopOnSend(text);
        if (hopped) return;
        releaseSend(findSendButton(null), text);
      })());
    },
    true,
  );

  // Capture-phase on document: survives Claude remounting the composer node
  document.addEventListener(
    "input",
    (ev) => {
      if (isComposerTarget(ev.target)) schedule();
    },
    true,
  );
  document.addEventListener(
    "keyup",
    (ev) => {
      if (isComposerTarget(ev.target)) schedule();
    },
    true,
  );

  bindHold();
  swallow(maybeReportMiss());
  mo.observe(document.documentElement, { childList: true, subtree: true });
}
