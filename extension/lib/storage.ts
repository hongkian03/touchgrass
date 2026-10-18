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

export async function readState(): Promise<PuddleState> {
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
}

export async function writeState(patch: Partial<PuddleState>): Promise<void> {
  await browser.storage.local.set(patch);
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
