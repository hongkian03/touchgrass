export { classify } from "./classify";
export { isAllowedAiHost } from "./aiSites";
export { groqIsAiSite, grokIsAiSite } from "./groqClassify";
export type { AiSiteVerdict, GrokAiVerdict } from "./groqClassify";
export {
  canContinueOnboarding,
  coreHostname,
  customPlatformId,
  extractHostname,
  faviconForHost,
  hostnameFromCustomId,
  hostLadder,
  hostsForPlatforms,
  isCustomPlatformId,
  originPatternFromInput,
  resolvePlatformFromInput,
} from "./hosts";
export type { ResolveResult } from "./hosts";
export {
  COACH_BUBBLE_MAX,
  COACH_HIDE_MS,
  coachBottomPx,
  coachNeverDeepSeek,
  shouldShowCoach,
} from "./coach";
export { buildCoachSuggestion, runCoachYes } from "./coachYes";
export { recomputeAccuracy } from "./evalAccuracy";
export { parseExport } from "./upload";
export { parseVoiceIntent } from "./voiceIntent";
export { monthTotals, totalsForKeys, weekTotals } from "./weekTotals";
export {
  G_CO2_PER_SAPLING,
  daySavings,
  monthSavings,
  saplingsFromCo2G,
  weekSavings,
} from "./savings";
export { route, routeTargetHost } from "./route";
export {
  DASHBOARD_COLUMN_WIDTH,
  DASHBOARD_MAX_WIDTH,
  DASHBOARD_MIN_WIDTH,
  ONBOARDING_MAX_WIDTH,
  POPUP_HEIGHT,
  POPUP_WIDTH,
} from "./layout";
export {
  lastNDays,
  localDateKey,
  monthWindow,
  score,
  wastePenalty,
  weekWindow,
} from "./score";
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
