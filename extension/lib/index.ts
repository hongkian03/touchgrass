export { classify } from "./classify";
export { canContinueOnboarding, hostsForPlatforms } from "./hosts";
export { route, routeTargetHost } from "./route";
export { localDateKey, score, wastePenalty, weekWindow } from "./score";
export { computeStreak } from "./streak";
export { DEFAULT_STATE, readState, writeState } from "./storage";
export type { PuddleState } from "./storage";
export { dayTotals } from "./totals";
export type { DayTotals, FootprintModel } from "./totals";
export type {
  Platform,
  PromptClass,
  PromptKind,
  RouteSuggestion,
  UsageRow,
} from "./types";
