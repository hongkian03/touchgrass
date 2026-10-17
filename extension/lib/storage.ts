import type { UsageRow } from "./types";

export type PuddleState = {
  onboarded: boolean;
  enabledPlatforms: string[];
  usage: UsageRow[];
  score: number;
  streak: number;
  lastCoachAt: number;
};

export const DEFAULT_STATE: PuddleState = {
  onboarded: false,
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
