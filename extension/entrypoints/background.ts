export default defineBackground(() => {
  console.log("[Puddle] background ready");

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      browser.tabs.create({
        url: browser.runtime.getURL("/onboarding.html"),
      });
    }
  });
});
