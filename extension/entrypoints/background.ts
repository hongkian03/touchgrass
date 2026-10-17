import { backendHealth } from "../lib/backendClient";
import { rebindCoachScripts } from "../lib/coachInject";
import { groqIsAiSite } from "../lib/groqClassify";
import { readState } from "../lib/storage";

export default defineBackground(() => {
  console.log("[Touchgrass] background ready");

  void rebindFromState();

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      browser.tabs.create({
        url: browser.runtime.getURL("/onboarding.html"),
      });
    }
    void rebindFromState();
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
      if (op === "health") {
        void backendHealth().then((result) => sendResponse(result));
        return true;
      }
      sendResponse({ ok: false, error: `unknown_op:${op}` });
      return true;
    }

    if (message?.type === "puddle/classify-ai-site") {
      const hostname = String(message.hostname ?? "");
      void groqIsAiSite(hostname).then((verdict) => sendResponse(verdict));
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
        const listener = (
          id: number,
          info: { status?: string },
        ) => {
          if (id !== tabId || info.status !== "complete") return;
          browser.tabs.onUpdated.removeListener(listener);
          void browser.scripting
            .executeScript({
              target: { tabId },
              func: (text: string) => {
                const el =
                  document.querySelector<HTMLElement>(
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
