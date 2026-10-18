import { classify } from "./classify";
import { lastNDays, localDateKey } from "./score";
import type { Platform, UsageRow } from "./types";

export type UsageInsightCard = { id: string; text: string };

/** Rows in the last `days` local calendar days (today inclusive). */
export function rowsInLastDays(
  rows: UsageRow[],
  today: Date,
  days: number,
): UsageRow[] {
  const keys = new Set(lastNDays(today, days));
  return rows.filter((r) => keys.has(localDateKey(new Date(r.ts))));
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** Tips computed only from the user's recorded prompts; no canned numbers. */
export function usageInsightCards(
  rows: UsageRow[],
  today: Date,
  platforms: Platform[],
  days = 7,
): UsageInsightCard[] {
  const range = days === 1 ? "today" : `in the last ${days} days`;
  const slice = rowsInLastDays(rows, today, days);
  if (slice.length === 0) {
    return [
      {
        id: "empty",
        text: `No prompts recorded ${range} yet. Send one on an AI site you picked in setup.`,
      },
    ];
  }

  const small = slice.filter(
    (r) => classify(r.prompt_text, r.kind) === "small_ok",
  ).length;
  const regen = slice.filter((r) => r.regenerated).length;
  const videos = slice.filter((r) => r.kind === "video").length;
  const images = slice.reduce(
    (acc, r) => acc + (r.kind === "image" ? 1 : 0) + (r.attachments ?? 0),
    0,
  );

  const bySite = new Map<string, number>();
  for (const r of slice) bySite.set(r.provider, (bySite.get(r.provider) ?? 0) + 1);
  const [topId, topCount] = [...bySite.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const topName = platforms.find((p) => p.id === topId)?.name ?? topId;

  return [
    {
      id: "small-enough",
      text: `${Math.round((small / slice.length) * 100)}% of your ${plural(slice.length, "prompt")} ${range} were simple questions a small model could answer.`,
    },
    {
      id: "regenerates",
      text:
        regen === 0
          ? `No regenerated answers ${range}.`
          : `You regenerated ${plural(regen, "answer")} ${range}.`,
    },
    videos > 0 || images > 0
      ? {
          id: "media",
          text: `${plural(images, "image")} and ${plural(videos, "video")} ${range}. Those cost far more than text (estimated).`,
        }
      : {
          id: "top-site",
          text: `Most used ${range}: ${topName} (${topCount} of ${slice.length}).`,
        },
  ];
}
