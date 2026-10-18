import platformsData from "../data/platforms.json";
import {
  missingSelectorKeys,
  queryBySelector,
  snapshotHtml,
  type SiteAdapter,
} from "./adapter";
import { bgBackend } from "./backendBridge";
import { readBackendConfig } from "./backendClient";
import { COACH_TYPE_DEBOUNCE_MS, shouldShowCoach } from "./coach";
import {
  greenerAlternative,
  isCheckInDue,
  isOnBigModel,
  prefillUrl,
  shouldOfferChoice,
  switchModelHere,
  type CoachChoice,
} from "./coachChoice";
import { mountCoach, unmountCoach } from "./coachMount";
import { scrapeRecentMessages } from "./coachYes";
import {
  DraftCoach,
  type CoachClassifyResponse,
  type CoachDraft,
} from "./draftCoach";
import { draftFrom, findComposer } from "./findComposer";
import { providerFromHostname } from "./route";
import { FOOTPRINT_MODELS } from "./footprint";
import { resolveActiveSite } from "./siteDetect";
import {
  appendCoachChoice,
  appendUsage,
  bumpBigModelStreak,
  isExtensionContextAlive,
  isExtensionContextError,
  isExtensionStorageAlive,
  readState,
  writeState,
} from "./storage";
import type { Platform, PromptKind } from "./types";

const platforms = platformsData as Platform[];
const footprintModels = FOOTPRINT_MODELS;
const MISS_THRESHOLD = 3;
/** Wait after a send before offering the after-send toast. */
const AFTER_SEND_DELAY_MS = 600;
/** How long a status note stays before the toast closes. */
const NOTE_MS = 3500;

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
  // No invented floors: if we can't estimate it, show nothing saved
  if (!fromModel || !toModel) {
    return { savedWh: 0, savedCo2G: 0, savedWaterMl: 0 };
  }
  return {
    savedWh: Math.max(0, fromModel.Wh - toModel.Wh),
    savedCo2G: Math.max(0, fromModel.co2_g - toModel.co2_g),
    savedWaterMl: Math.max(0, (fromModel.water_L - toModel.water_L) * 1000),
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

/** Model picker buttons on the supported sites (best effort; adapters override). */
const MODEL_PICKER_SELECTOR = [
  "#model-label",
  "[data-testid='model-switcher']",
  "[data-testid^='model-switcher']",
  "[data-testid='model-selector']",
  "[data-testid^='model-selector']",
  "[data-test-id='bard-mode-menu-button']",
].join(", ");

/** Chalk event for each toast choice (backend CoachingEvent.event_type). */
const CHALK_EVENT: Record<CoachChoice, string> = {
  switch_here: "switch_clicked",
  open_other: "sent_with_target",
  send_anyway: "sent_anyway",
  not_now: "dismissed",
};

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

type Offer = {
  text: string;
  timing: "before_send" | "after_send" | "check_in";
  chalk: CoachClassifyResponse | null;
};

/**
 * Live coach: records every send, and offers a three-way choice (switch here,
 * open another AI, send anyway) for simple asks on a big model. Never blocks a send.
 */
export function startCoachWatch(): void {
  const flag = "__puddleCoachWatch";
  const w = window as unknown as Record<string, boolean>;
  if (w[flag]) return;
  w[flag] = true;

  let debounceTimer: number | undefined;
  let noteTimer: number | undefined;
  let adapter: SiteAdapter | null = null;
  let missStreak = 0;
  let repairInFlight = false;
  let draftRevision = 0;
  let sendBound = false;
  /** Toast currently up, if any. */
  let offer: Offer | null = null;
  /** Last text a toast was shown for, so the same draft isn't offered twice. */
  let lastOfferedText = "";
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
    return document.querySelector<HTMLElement>(MODEL_PICKER_SELECTOR);
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
          snapshot_html: snapshotHtml(document.documentElement.outerHTML),
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

  /** Map the page's model picker to FOOTPRINT_MODELS keys: small label → smallModel. */
  const footprintModelFor = (platform: Platform): string => {
    const label = modelLabelEl()?.textContent?.trim() ?? "";
    return SMALL_MODEL_RE.test(label)
      ? platform.smallModel
      : platform.defaultModel;
  };

  const currentPlatform = (): Platform | undefined =>
    platforms.find((p) => p.id === activeSite);

  const offerable = (text: string): boolean => {
    const platform = currentPlatform();
    if (!platform) return false;
    return shouldOfferChoice({
      text,
      platform,
      currentModel: footprintModelFor(platform),
    });
  };

  // ---- Choice toast -------------------------------------------------------

  const closeOffer = () => {
    if (noteTimer) window.clearTimeout(noteTimer);
    noteTimer = undefined;
    offer = null;
    unmountCoach();
  };

  const recordChoice = (
    choice: CoachChoice,
    via: "button" | "send",
    extra: { target?: string; outcome?: string } = {},
  ) => {
    const o = offer;
    if (!o) return;
    swallow(
      appendCoachChoice({
        ts: new Date().toISOString(),
        site: activeSite ?? location.hostname,
        choice,
        via,
        timing: o.timing,
        ...extra,
      }),
    );
    // Sends report to Chalk via chalkCoach.onSend(); buttons report here
    if (o.chalk && via === "button") {
      chalkCoach.safeEmit(CHALK_EVENT[choice], o.chalk);
    }
    console.log(
      `[Touchgrass] coach choice ${choice} (${via}, ${o.timing}${
        extra.outcome ? `, ${extra.outcome}` : ""
      })`,
    );
  };

  /** Keep the toast up with a status line, then close it. */
  const noteThenClose = (render: (note: string) => void, note: string) => {
    render(note);
    if (noteTimer) window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(closeOffer, NOTE_MS);
  };

  const showChoice = async (
    text: string,
    timing: Offer["timing"],
    chalk: CoachClassifyResponse | null,
  ) => {
    if (!contextOk() || !isExtensionStorageAlive()) return;
    const site = await ensureSite();
    const platform = platforms.find((p) => p.id === site);
    if (!site || !platform) return;

    const state = await readState();
    // Lowest-power model across the user's other selected AIs
    const alt = greenerAlternative({
      enabledPlatforms: state.enabledPlatforms,
      platforms,
      currentId: site,
      currentModel: footprintModelFor(platform),
      models: footprintModels,
    });
    const altName = alt ? `${alt.name} (${alt.modelLabel})` : null;
    const saved = estimateHopSavings(site, site);

    offer = { text, timing, chalk };
    lastOfferedText = text;
    await writeState({ lastCoachAt: Date.now() });

    const chalkMeta = chalk
      ? (() => {
          const r = chalk as CoachClassifyResponse & {
            small_ok?: number;
            confidence?: number;
            elapsed_ms?: number;
            chalk_feature_group?: string;
          };
          const pct = (v?: number) =>
            typeof v === "number" && v > 0 ? Math.round(v * 100) : null;
          return {
            confidencePct: pct(r.confidence) ?? pct(r.small_ok),
            smallOkPct: pct(r.small_ok),
            elapsedMs: typeof r.elapsed_ms === "number" ? r.elapsed_ms : null,
            policyVersion: r.policy_version ?? null,
            featureGroup: r.chalk_feature_group ?? "coaching.session_v2",
            savedWh: saved.savedWh,
            savedCo2G: saved.savedCo2G,
          };
        })()
      : null;

    const lead =
      timing === "before_send"
        ? "Simple ask on a big model."
        : "That was a simple ask on a big model.";
    const message =
      saved.savedWh > 0
        ? `${lead} A smaller model uses ≈${saved.savedWh.toFixed(2)} Wh less per prompt (est.).`
        : `${lead} A smaller model would do.`;

    const render = (note: string | null = null) => {
      mountCoach({
        shadow: true,
        message,
        actions: {
          badge: chalk?.mode === "mock" ? "Synthetic mock results" : null,
          chalkMeta,
          note,
          switchLabel: "Switch to a smaller model here",
          onSwitch: platform.smallModel !== platform.defaultModel
            ? () => {
                swallow(
                  (async () => {
                    const outcome = await switchModelHere(modelLabelEl());
                    recordChoice("switch_here", "button", { outcome });
                    noteThenClose(
                      render,
                      outcome === "picked"
                        ? "Switched to a smaller model."
                        : outcome === "menu_open"
                          ? "Pick a smaller model (mini, Haiku, Flash) in the menu."
                          : "Couldn't find the model menu here. Pick a smaller model yourself.",
                    );
                  })(),
                );
              }
            : undefined,
          openOtherLabel: altName ? `Open in ${altName}` : undefined,
          onOpenOther:
            alt && altName
              ? () => {
                  swallow(
                    (async () => {
                      const url = prefillUrl(alt.id, text);
                      if (url) {
                        window.open(url, "_blank", "noopener");
                        recordChoice("open_other", "button", {
                          target: alt.id,
                          outcome: "prefilled",
                        });
                        noteThenClose(
                          render,
                          `Opened ${alt.name} with your prompt. Pick ${alt.modelLabel} there.`,
                        );
                        return;
                      }
                      let copied = false;
                      try {
                        await navigator.clipboard.writeText(text);
                        copied = true;
                      } catch {
                        // clipboard blocked; still open the site
                      }
                      window.open(alt.url, "_blank", "noopener");
                      recordChoice("open_other", "button", {
                        target: alt.id,
                        outcome: copied ? "copied" : "copy_failed",
                      });
                      noteThenClose(
                        render,
                        copied
                          ? `Prompt copied, paste it there and pick ${alt.modelLabel}.`
                          : "Couldn't copy. Select your prompt and copy it.",
                      );
                    })(),
                  );
                }
              : undefined,
          sendAnywayLabel:
            timing === "before_send" ? "Send anyway" : "Keep this model",
          onSendAnyway: () => {
            recordChoice("send_anyway", "button");
            closeOffer();
            if (timing === "before_send") {
              const btn = adapter?.selectors.send_button
                ? queryBySelector(adapter.selectors.send_button)
                : findSendButton(null);
              if (btn instanceof HTMLElement) btn.click();
            }
          },
        },
      });
    };

    render();
    console.log(`[Touchgrass] coach offer (${timing}${chalk ? ", chalk" : ""})`);
  };

  /** Every 5th prompt in a row on a big model (CHECK_IN_EVERY): "have you switched?" */
  const showCheckIn = async (streak: number) => {
    if (!contextOk() || !isExtensionStorageAlive()) return;
    const site = await ensureSite();
    const platform = platforms.find((p) => p.id === site);
    if (!site || !platform) return;

    const state = await readState();
    const alt = greenerAlternative({
      enabledPlatforms: state.enabledPlatforms,
      platforms,
      currentId: site,
      currentModel: footprintModelFor(platform),
      models: footprintModels,
    });
    const saved = estimateHopSavings(site, site);

    offer = { text: "", timing: "check_in", chalk: null };
    await writeState({ lastCoachAt: Date.now() });

    const smaller =
      saved.savedWh > 0
        ? ` A smaller model here uses ≈${saved.savedWh.toFixed(2)} Wh less per prompt (est.).`
        : "";
    const greener = alt
      ? ` The lightest model in your AIs is ${alt.name} ${alt.modelLabel}: ≈${alt.savedWh.toFixed(2)} Wh less per prompt (est.).`
      : "";
    const message = `Check-in: ${streak} prompts in a row on ${platform.name}'s big model. Have you switched to a smaller model?${smaller}${greener}`;

    const render = (note: string | null = null) => {
      mountCoach({
        shadow: true,
        message,
        actions: {
          note,
          switchLabel: "Switch to a smaller model here",
          onSwitch: () => {
            swallow(
              (async () => {
                const outcome = await switchModelHere(modelLabelEl());
                recordChoice("switch_here", "button", { outcome });
                if (outcome === "picked") swallow(bumpBigModelStreak(site, false));
                noteThenClose(
                  render,
                  outcome === "picked"
                    ? "Switched to a smaller model."
                    : outcome === "menu_open"
                      ? "Pick a smaller model (mini, Haiku, Flash) in the menu."
                      : "Couldn't find the model menu here. Pick a smaller model yourself.",
                );
              })(),
            );
          },
          openOtherLabel: alt ? `Switch to ${alt.name} (${alt.modelLabel})` : undefined,
          onOpenOther: alt
            ? () => {
                window.open(alt.url, "_blank", "noopener");
                recordChoice("open_other", "button", {
                  target: alt.id,
                  outcome: "opened",
                });
                noteThenClose(render, `Opened ${alt.name}. Pick ${alt.modelLabel} there.`);
              }
            : undefined,
          sendAnywayLabel: "Not now",
          onSendAnyway: () => {
            recordChoice("not_now", "button");
            closeOffer();
          },
        },
      });
    };

    render();
    console.log(`[Touchgrass] check-in after ${streak} big-model prompts`);
  };

  // ---- Chalk (backend) classify: feeds the same toast ----------------------

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
    emit: (eventType, response) => swallow(emitEvent(eventType, response)),
    display: (response) => {
      if (!response) return;
      const composer = composerForSite();
      const text = composer ? draftFrom(composer).trim() : "";
      if (!text) return;
      // Chalk agrees (or decides alone): show/refresh the toast with its meta
      if (offer && offer.text === text && offer.chalk) return;
      swallow(showChoice(text, "before_send", response));
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

  // ---- Usage recording ------------------------------------------------------

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

  // ---- Send: observe only, never preventDefault ----------------------------

  const onSend = () => {
    if (!contextOk()) return;
    const composer = composerForSite();
    if (!composer) return;
    const text = draftFrom(composer).trim();
    // Sync reads (text, attachments) happen before the site clears the box
    swallow(recordSend(text));
    clearDebounce();

    const shown = offer;
    if (shown) {
      // Sent with the toast up and no button picked
      if (shown.timing === "before_send") recordChoice("send_anyway", "send");
      if (shown.timing === "check_in") recordChoice("not_now", "send");
      closeOffer();
    }
    chalkCoach.onSend();

    const platform = currentPlatform();
    if (!platform || !text) return;
    const onBig = isOnBigModel(platform, footprintModelFor(platform));
    const site = platform.id;
    const offerAfter = !shown && text !== lastOfferedText && offerable(text);
    swallow(
      (async () => {
        // Persistent check-in beats the one-off simple-ask toast
        const streak = await bumpBigModelStreak(site, onBig);
        const due = isCheckInDue(streak);
        if (!due && !offerAfter) return;
        await new Promise((r) => window.setTimeout(r, AFTER_SEND_DELAY_MS));
        if (offer || !isExtensionStorageAlive()) return;
        if (due) {
          await showCheckIn(streak);
          return;
        }
        const state = await readState();
        if (!shouldShowCoach(state.lastCoachAt)) return;
        await showChoice(text, "after_send", null);
      })(),
    );
  };

  const bindSend = () => {
    if (sendBound) return;
    sendBound = true;
    document.addEventListener(
      "click",
      (ev) => {
        const t = ev.target as Element | null;
        if (!t) return;
        const sendSel = adapter?.selectors.send_button;
        let sendBtn: Element | null = null;
        try {
          sendBtn = sendSel ? t.closest(sendSel) : findSendButton(t);
        } catch {
          sendBtn = t.closest("button[type='submit'], button[aria-label='Send']");
        }
        if (sendBtn) onSend();
      },
      true,
    );
  };

  // ---- Typing: offer the choice before the send ----------------------------

  const schedule = () => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      swallow(maybeCoach());
    }, COACH_TYPE_DEBOUNCE_MS);
  };

  const maybeCoach = async () => {
    if (!contextOk()) return;
    swallow(maybeReportMiss());
    const composer = composerForSite();
    if (!composer) {
      console.warn("[Touchgrass] no composer found");
      return;
    }
    bindSend();
    await ensureSite();

    const text = draftFrom(composer).trim();
    // Don't replace a check-in with a typing toast
    if (offer?.timing === "check_in") return;
    if (offer && offer.timing === "before_send" && offer.text !== text) {
      // Draft changed under the toast: drop it, re-evaluate below
      closeOffer();
    }
    if (!text || text.length < 4 || text === lastOfferedText) return;
    if (!isExtensionStorageAlive()) return;

    const state = await readState();
    if (!shouldShowCoach(state.lastCoachAt)) {
      console.log("[Touchgrass] coach cooldown — wait ~1 min");
      return;
    }

    // Chalk classifies in the background when the backend is paired
    const cfg = await readBackendConfig();
    if (cfg.sessionToken && cfg.backendEnabled) {
      const platform = currentPlatform();
      const model =
        modelLabelEl()?.textContent?.trim() ||
        platform?.defaultModel ||
        "default";
      const chalkDraft = await buildDraft(text, model);
      if (chalkDraft) chalkCoach.update(chalkDraft);
    }

    if (offerable(text)) await showChoice(text, "before_send", null);
  };

  // Capture-phase Enter: observe the send (the site still handles it)
  document.addEventListener(
    "keydown",
    (ev) => {
      if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing) return;
      if (!isComposerTarget(ev.target)) return;
      onSend();
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
      if (ev.key === "Enter") return;
      if (isComposerTarget(ev.target)) schedule();
    },
    true,
  );

  bindSend();
  swallow(maybeReportMiss());
  mo.observe(document.documentElement, { childList: true, subtree: true });
}
