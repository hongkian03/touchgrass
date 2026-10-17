export default defineContentScript({
  // Matches listed for WXT entry typing only. registration:runtime keeps
  // content_scripts [] in the shipped manifest; hosts stay empty until
  // chrome.permissions.request in onboarding (issue #4).
  matches: ["https://chatgpt.com/*", "https://claude.ai/*"],
  registration: "runtime",
  main() {
    console.log("[Puddle] content stub — Pip lands in issue #5");
  },
});
