import type { RouteSuggestion } from "./types";

/** Cooldown after a redirect so we don't spam tabs. */
export const COACH_HIDE_MS = 60 * 1000;
export const COACH_BUBBLE_MAX = 240;
export const COACH_RIGHT = 16;
export const COACH_TOP = 16;
export const COACH_BOTTOM_DEFAULT = 16;
export const COACH_BOTTOM_CLEAR = 96;
/** Quiet time after typing before coach plans. */
export const COACH_TYPE_DEBOUNCE_MS = 2000;

export function shouldShowCoach(lastCoachAt: number, now = Date.now()): boolean {
  if (!lastCoachAt) return true;
  return now - lastCoachAt >= COACH_HIDE_MS;
}

/** @deprecated Overlay is top-right now. Kept for callers/tests. */
export function coachBottomPx(
  composer: Element | null,
  overlayHeight = 160,
): number {
  if (!composer) return COACH_BOTTOM_DEFAULT;
  const c = composer.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const box = {
    left: vw - COACH_RIGHT - 200,
    right: vw - COACH_RIGHT,
    top: vh - COACH_BOTTOM_DEFAULT - overlayHeight,
    bottom: vh - COACH_BOTTOM_DEFAULT,
  };
  const hit =
    box.left < c.right &&
    box.right > c.left &&
    box.top < c.bottom &&
    box.bottom > c.top;
  return hit ? COACH_BOTTOM_CLEAR : COACH_BOTTOM_DEFAULT;
}

export function coachNeverDeepSeek(suggestion: RouteSuggestion): boolean {
  const url = suggestion.targetUrl ?? "";
  return !/deepseek/i.test(url);
}
