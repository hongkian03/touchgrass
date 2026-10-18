import type { CoachChoiceRow } from "./coachChoice";
import type { UsageRow } from "./types";

export type PuddleState = {
  onboarded: boolean;
  userName: string;
  enabledPlatforms: string[];
  usage: UsageRow[];
  score: number;
  streak: number;
  lastCoachAt: number;
};

export const DEFAULT_STATE: PuddleState = {
  onboarded: false,
  userName: "",
  enabledPlatforms: [],
  usage: [],
  score: 100,
  streak: 0,
  lastCoachAt: 0,
};

/** True when chrome.runtime still belongs to a live extension (false after reload). */
export function isExtensionContextAlive(): boolean {
  try {
    return Boolean(browser?.runtime?.id);
  } catch {
    return false;
  }
}

/** True when chrome.storage is usable (false after extension reload until tab refresh). */
export function isExtensionStorageAlive(): boolean {
  try {
    if (!isExtensionContextAlive()) return false;
    return Boolean(browser?.storage?.local);
  } catch {
    return false;
  }
}

export function isExtensionContextError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /extension context invalidated|context invalidated/i.test(msg);
}

export async function readState(): Promise<PuddleState> {
  if (!isExtensionStorageAlive()) {
    return { ...DEFAULT_STATE };
  }
  try {
    const raw = await browser.storage.local.get(null);
    return {
      onboarded: Boolean(raw.onboarded),
      userName: typeof raw.userName === "string" ? raw.userName : "",
      enabledPlatforms: Array.isArray(raw.enabledPlatforms)
        ? (raw.enabledPlatforms as string[])
        : [],
      usage: Array.isArray(raw.usage) ? (raw.usage as UsageRow[]) : [],
      score: typeof raw.score === "number" ? raw.score : 100,
      streak: typeof raw.streak === "number" ? raw.streak : 0,
      lastCoachAt: typeof raw.lastCoachAt === "number" ? raw.lastCoachAt : 0,
    };
  } catch (e) {
    if (isExtensionContextError(e)) return { ...DEFAULT_STATE };
    throw e;
  }
}

export async function writeState(patch: Partial<PuddleState>): Promise<void> {
  if (!isExtensionStorageAlive()) return;
  try {
    await browser.storage.local.set(patch);
  } catch (e) {
    if (isExtensionContextError(e)) return;
    throw e;
  }
}

/** Keep storage bounded; oldest rows drop first. */
export const MAX_USAGE_ROWS = 2000;

/** Append one sent prompt to local usage history. */
export async function appendUsage(row: UsageRow): Promise<void> {
  const { usage } = await readState();
  const next = [...usage, row];
  await writeState({ usage: next.slice(-MAX_USAGE_ROWS) });
}

/** Coach toast decisions (which button the user picked). */
export async function appendCoachChoice(row: CoachChoiceRow): Promise<void> {
  const raw = await browser.storage.local.get("coachChoices");
  const prev = Array.isArray(raw.coachChoices)
    ? (raw.coachChoices as CoachChoiceRow[])
    : [];
  await browser.storage.local.set({
    coachChoices: [...prev, row].slice(-MAX_USAGE_ROWS),
  });
}

export async function readCoachChoices(): Promise<CoachChoiceRow[]> {
  const raw = await browser.storage.local.get("coachChoices");
  return Array.isArray(raw.coachChoices)
    ? (raw.coachChoices as CoachChoiceRow[])
    : [];
}

/** Rough byte size of persisted state (UTF-16 JSON). */
export function estimateStorageBytes(state: PuddleState): number {
  try {
    return new TextEncoder().encode(JSON.stringify(state)).length;
  } catch {
    return 0;
  }
}

export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
