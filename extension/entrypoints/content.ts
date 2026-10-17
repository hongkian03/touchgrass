import coachCopy from "../data/coach-copy.json";
import { shouldShowCoach } from "../lib/coach";
import { mountCoach, unmountCoach } from "../lib/coachMount";
import { runCoachYes } from "../lib/coachYes";
import { classify } from "../lib/classify";
import { readState, writeState } from "../lib/storage";

function findComposer(): HTMLTextAreaElement | HTMLElement | null {
  return (
    document.querySelector<HTMLTextAreaElement>("textarea") ||
    document.querySelector<HTMLElement>("[contenteditable='true']")
  );
}

function draftFrom(el: HTMLTextAreaElement | HTMLElement): string {
  if (el instanceof HTMLTextAreaElement) return el.value;
  return el.textContent ?? "";
}

export default defineContentScript({
  // Matches for WXT typing only. registration:runtime keeps
  // content_scripts [] until chrome.permissions.request (#4).
  matches: ["https://chatgpt.com/*", "https://claude.ai/*"],
  registration: "runtime",
  main() {
    void boot();
  },
});

async function boot() {
  const state = await readState();
  if (!shouldShowCoach(state.lastCoachAt)) return;

  const composer = findComposer();
  if (!composer) return;
  const draft = draftFrom(composer).trim();
  if (!draft) return;
  if (classify(draft, "text") !== "small_ok") return;

  mountCoach({
    shadow: true,
    message: coachCopy.oversized,
    composer,
    onYes: () => {
      void (async () => {
        await runCoachYes({
          draft: draftFrom(composer),
          model: "gpt-5",
          provider: "chatgpt",
        });
        unmountCoach();
      })();
    },
    onNo: () => {
      void (async () => {
        await writeState({ lastCoachAt: Date.now() });
        unmountCoach();
      })();
    },
  });
}
