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
    if (message?.type !== "puddle/classify-ai-site") return;
    const hostname = String(message.hostname ?? "");
    void groqIsAiSite(hostname).then((verdict) => sendResponse(verdict));
    return true; // async
  });
});
