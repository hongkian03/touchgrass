import { groqIsAiSite } from "../lib/groqClassify";

export default defineBackground(() => {
  console.log("[Puddle] background ready");

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      browser.tabs.create({
        url: browser.runtime.getURL("/onboarding.html"),
      });
    }
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "puddle/classify-ai-site") {
      const hostname = String(message.hostname ?? "");
      void groqIsAiSite(hostname).then((verdict) => sendResponse(verdict));
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
                  document.querySelector<HTMLTextAreaElement>("textarea") ||
                  document.querySelector<HTMLElement>("[contenteditable='true']");
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
