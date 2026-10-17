import {
  backendHealth,
  coachingClassify,
  coachingEmitEvent,
  fetchAdapter,
  fetchEvalsSummary,
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

export default defineBackground(() => {
  console.log("[Touchgrass] background ready");

  void rebindFromState();
  void syncAdapters();

  try {
    void browser.alarms.clear(ADAPTER_ALARM);
    void browser.alarms.create(ADAPTER_ALARM, { periodInMinutes: 5 });
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ADAPTER_ALARM) void syncAdapters();
    });
  } catch {
    // alarms permission optional in some builds
  }

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      browser.tabs.create({
        url: browser.runtime.getURL("/onboarding.html"),
      });
    }
    void rebindFromState();
    void syncAdapters();
  });

  browser.permissions.onAdded.addListener(() => {
    void rebindFromState();
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
                const el = document.querySelector<HTMLElement>(
                  '[data-testid="chat-input"], [data-testid="prompt-textarea"], div.ProseMirror[contenteditable="true"], textarea, [contenteditable="true"]',
                );
                if (!el) return false;
                if (el instanceof HTMLTextAreaElement) {
                  el.focus();
                  el.value = text;
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                  return true;
                }
                el.focus();
                el.textContent = text;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                return true;
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
  } catch (e) {
    console.warn("[Touchgrass] coach rebind failed", e);
  }
}
