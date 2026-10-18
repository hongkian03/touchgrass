import {
  autoPairCoachingSession,
  backendHealth,
  coachingClassify,
  coachingEmitEvent,
  coachingTargets,
  fetchAdapter,
  fetchEvalsSummary,
  getCoachingInsights,
  getInsightsLatest,
  getJob,
  mapTipsToCards,
  pairCoachingSession,
  runAdapterRepairPipeline,
  runUploadPipeline,
  syncAdaptersFromBackend,
  uploadExport,
  waitForJob,
  type AdapterFailureReport,
  type SiteAdapterPayload,
} from "../lib/backendClient";
import {
  resolveAdapter,
  writeCachedAdapter,
  type SiteAdapter,
} from "../lib/adapter";
import { rebindCoachScripts } from "../lib/coachInject";
import { togglePanel } from "../lib/floatingPanel";
import { POPUP_HEIGHT, POPUP_WIDTH } from "../lib/layout";
import { groqIsAiSite } from "../lib/groqClassify";
import { groqRouteQuery } from "../lib/groqRoute";
import { readState } from "../lib/storage";

const ADAPTER_ALARM = "touchgrass-adapter-sync";

async function broadcastAdapter(adapter: SiteAdapter): Promise<void> {
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null) return;
      try {
        await browser.tabs.sendMessage(tab.id, {
          type: "touchgrass/adapter-updated",
          adapter,
        });
      } catch {
        // tab has no content script
      }
    }),
  );
}

async function syncAdapters(): Promise<Record<string, SiteAdapterPayload>> {
  try {
    const updated = await syncAdaptersFromBackend();
    for (const adapter of Object.values(updated)) {
      await broadcastAdapter(adapter);
      console.log(
        `[Touchgrass] adapter updated to v${adapter.version} (${adapter.site})`,
      );
    }
    return updated;
  } catch (e) {
    console.warn("[Touchgrass] adapter sync failed", e);
    return {};
  }
}

async function ensureCoachingSession(): Promise<void> {
  try {
    await autoPairCoachingSession();
    console.log("[Touchgrass] coaching session ready");
  } catch (e) {
    console.warn("[Touchgrass] auto-pair failed", e);
  }
}

export default defineBackground(() => {
  console.log("[Touchgrass] background ready");

  void rebindFromState();
  void syncAdapters();
  void ensureCoachingSession();

  try {
    void browser.alarms.clear(ADAPTER_ALARM);
    void browser.alarms.create(ADAPTER_ALARM, { periodInMinutes: 5 });
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ADAPTER_ALARM) void syncAdapters();
    });
  } catch {
    // alarms permission optional in some builds
  }

  browser.runtime.onInstalled.addListener(() => {
    // Onboarding runs inline in the popup (360×520). No separate tab.
    void rebindFromState();
    void syncAdapters();
    void ensureCoachingSession();
  });

  browser.permissions.onAdded.addListener(() => {
    void rebindFromState();
  });

  // onClicked never fires while a popup is set; clear any default popup (an older
  // manifest's, or one left from a build) so every click reaches the panel.
  void browser.action.setPopup({ popup: "" }).catch(() => undefined);

  // Toolbar click: rounded, draggable panel on the page. Chrome-protected pages
  // (chrome://, new tab, Web Store) can't be scripted, so they get the popup.
  browser.action.onClicked.addListener((tab) => {
    const tabId = tab.id;
    if (tabId == null) return;
    void (async () => {
      try {
        await browser.scripting.executeScript({
          target: { tabId },
          func: togglePanel,
          args: [browser.runtime.getURL("/popup.html"), POPUP_WIDTH, POPUP_HEIGHT],
        });
      } catch {
        // Show Chrome's popup just this once, then hand the tab back to the
        // panel; a lingering per-tab popup kept normal sites on the square popup.
        await browser.action.setPopup({ tabId, popup: "/popup.html" });
        try {
          await browser.action.openPopup();
          await browser.action.setPopup({ tabId, popup: "" });
        } catch {
          // Older Chrome: the popup opens on the next click; cleared on navigation below
        }
      }
    })();
  });

  // Any per-tab popup fallback ends when the tab goes to a new page
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.url) void browser.action.setPopup({ tabId, popup: "" }).catch(() => undefined);
  });

  browser.commands.onCommand.addListener((command) => {
    if (command !== "pip-recap") return;
    void browser.tabs.create({
      url: browser.runtime.getURL("/dashboard.html#recap"),
    });
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "touchgrass/backend") {
      const op = String(message.op ?? "");
      void (async () => {
        try {
          if (op === "health") {
            sendResponse(await backendHealth());
            return;
          }
          if (op === "upload") {
            const bytes = message.bytes as ArrayBuffer;
            const filename = String(message.filename ?? "export.json");
            sendResponse({
              ok: true,
              ...(await uploadExport(bytes, filename)),
            });
            return;
          }
          if (op === "job") {
            sendResponse({
              ok: true,
              job: await getJob(String(message.jobId ?? "")),
            });
            return;
          }
          if (op === "wait-job") {
            sendResponse({
              ok: true,
              job: await waitForJob(String(message.jobId ?? "")),
            });
            return;
          }
          if (op === "insights-latest") {
            const latest = await getInsightsLatest();
            sendResponse({
              ok: true,
              ...latest,
              cards: mapTipsToCards(latest.insights?.tips ?? []),
            });
            return;
          }
          if (op === "upload-pipeline") {
            const bytes = message.bytes as ArrayBuffer;
            const filename = String(message.filename ?? "export.json");
            sendResponse({
              ok: true,
              ...(await runUploadPipeline(bytes, filename)),
            });
            return;
          }
          if (op === "adapter-get") {
            const site = String(message.site ?? "chatgpt");
            const adapter = await resolveAdapter(site);
            sendResponse({ ok: true, adapter });
            return;
          }
          if (op === "adapter-sync") {
            sendResponse({ ok: true, adapters: await syncAdapters() });
            return;
          }
          if (op === "adapter-repair") {
            const report = message.report as AdapterFailureReport;
            const result = await runAdapterRepairPipeline(report);
            if (result.adapter) {
              await writeCachedAdapter(result.adapter);
              await broadcastAdapter(result.adapter);
            }
            sendResponse({ ok: true, ...result });
            return;
          }
          if (op === "adapter-fetch") {
            const site = String(message.site ?? "chatgpt");
            const adapter = await fetchAdapter(site);
            await writeCachedAdapter(adapter);
            await broadcastAdapter(adapter);
            sendResponse({ ok: true, adapter });
            return;
          }
          if (op === "pair") {
            sendResponse({
              ok: true,
              ...(await pairCoachingSession(String(message.code ?? ""))),
            });
            return;
          }
          if (op === "classify") {
            const draft = (message.draft ?? {}) as Record<string, unknown>;
            sendResponse({
              ok: true,
              response: await coachingClassify(draft),
            });
            return;
          }
          if (op === "coaching-insights") {
            const insights = await getCoachingInsights();
            sendResponse({
              ok: true,
              ...insights,
              cards: insights.tips.map((t) => ({
                id: t.id,
                text: t.title,
              })),
            });
            return;
          }
          if (op === "coaching-targets") {
            sendResponse({ ok: true, ...(await coachingTargets()) });
            return;
          }
          if (op === "coaching-event") {
            sendResponse({
              ok: true,
              ...(await coachingEmitEvent(
                (message.event ?? {}) as Record<string, unknown>,
              )),
            });
            return;
          }
          if (op === "evals-summary") {
            sendResponse({
              ok: true,
              summary: await fetchEvalsSummary(),
            });
            return;
          }
          sendResponse({ ok: false, error: `unknown_op:${op}` });
        } catch (e) {
          sendResponse({
            ok: false,
            error: e instanceof Error ? e.message : "backend_error",
          });
        }
      })();
      return true;
    }

    if (message?.type === "puddle/classify-ai-site") {
      const hostname = String(message.hostname ?? "");
      void groqIsAiSite(hostname).then((verdict) => sendResponse(verdict));
      return true;
    }

    if (message?.type === "puddle/route-query") {
      void (async () => {
        const state = await readState();
        const enabled = Array.isArray(message.enabledPlatforms)
          ? (message.enabledPlatforms as string[])
          : state.enabledPlatforms;
        const result = await groqRouteQuery({
          draft: String(message.draft ?? ""),
          currentProvider: String(message.provider ?? "chatgpt"),
          enabledPlatforms: enabled,
        });
        sendResponse(result);
      })();
      return true;
    }

    if (message?.type === "puddle/coach-rebind") {
      void (async () => {
        const enabled = Array.isArray(message.enabledPlatforms)
          ? (message.enabledPlatforms as string[])
          : (await readState()).enabledPlatforms;
        const result = await rebindCoachScripts(enabled);
        sendResponse({ ok: true, ...result });
      })();
      return true;
    }

    if (message?.type === "puddle/coach-open-paste") {
      const url = String(message.url ?? "");
      const draft = String(message.draft ?? "");
      if (!url || /deepseek/i.test(url)) {
        sendResponse({ ok: false, error: "bad route" });
        return true;
      }
      void (async () => {
        const tab = await browser.tabs.create({ url });
        const tabId = tab.id;
        if (tabId == null) {
          sendResponse({ ok: false });
          return;
        }
        const listener = (id: number, info: { status?: string }) => {
          if (id !== tabId || info.status !== "complete") return;
          browser.tabs.onUpdated.removeListener(listener);
          void browser.scripting
            .executeScript({
              target: { tabId },
              func: (text: string) => {
                const COMPOSER =
                  '[data-testid="chat-input"], [data-testid="prompt-textarea"], div.ProseMirror[contenteditable="true"], rich-textarea textarea, textarea, [contenteditable="true"]';
                const SEND =
                  'button[aria-label="Send message"], button[aria-label="Send"], button[data-testid="send-button"], button[aria-label*="Send" i]';

                const findComposer = (): HTMLElement | null =>
                  document.querySelector<HTMLElement>(COMPOSER);

                const pasteInto = (el: HTMLElement): void => {
                  el.focus();
                  if (el instanceof HTMLTextAreaElement) {
                    el.value = text;
                    el.dispatchEvent(new Event("input", { bubbles: true }));
                    return;
                  }
                  // React contenteditables prefer insertText over textContent
                  try {
                    document.execCommand("selectAll", false);
                    const ok = document.execCommand("insertText", false, text);
                    if (ok) return;
                  } catch {
                    /* fall through */
                  }
                  el.textContent = text;
                  el.dispatchEvent(
                    new InputEvent("input", { bubbles: true, data: text }),
                  );
                };

                const pressSend = (): boolean => {
                  const btn = document.querySelector<HTMLButtonElement>(SEND);
                  if (btn && !btn.disabled) {
                    btn.click();
                    return true;
                  }
                  const el = findComposer();
                  if (!el) return false;
                  el.focus();
                  el.dispatchEvent(
                    new KeyboardEvent("keydown", {
                      key: "Enter",
                      code: "Enter",
                      keyCode: 13,
                      which: 13,
                      bubbles: true,
                      cancelable: true,
                    }),
                  );
                  el.dispatchEvent(
                    new KeyboardEvent("keyup", {
                      key: "Enter",
                      code: "Enter",
                      keyCode: 13,
                      which: 13,
                      bubbles: true,
                      cancelable: true,
                    }),
                  );
                  return true;
                };

                const run = (): boolean => {
                  const el = findComposer();
                  if (!el) return false;
                  pasteInto(el);
                  window.setTimeout(() => {
                    pressSend();
                  }, 350);
                  return true;
                };

                if (run()) return true;
                // Gemini SPA often mounts composer after "complete"
                let tries = 0;
                const id = window.setInterval(() => {
                  tries += 1;
                  if (run() || tries >= 24) window.clearInterval(id);
                }, 400);
                return false;
              },
              args: [draft],
            })
            .catch(() => undefined);
        };
        browser.tabs.onUpdated.addListener(listener);
        sendResponse({ ok: true, tabId });
      })();
      return true;
    }

    return undefined;
  });
});

async function rebindFromState(): Promise<void> {
  try {
    const state = await readState();
    await rebindCoachScripts(state.enabledPlatforms);
    // Clear cooldown so a fresh inject can coach immediately
    await browser.storage.local.set({ lastCoachAt: 0 });
  } catch (e) {
    console.warn("[Touchgrass] coach rebind failed", e);
  }
}
