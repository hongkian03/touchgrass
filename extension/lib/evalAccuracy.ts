import { classify } from "./classify";
import type { PromptKind } from "./types";

export type EvalRow = {
  prompt_text: string;
  kind: PromptKind | string;
  label: string;
};

/** Recompute classifier accuracy — never trust a stored accuracy field. */
export function recomputeAccuracy(rows: EvalRow[]): {
  correct: number;
  total: number;
  accuracy: number;
} {
  let correct = 0;
  for (const r of rows) {
    const kind = (r.kind === "image" || r.kind === "video" ? r.kind : "text") as
      | "text"
      | "image"
      | "video";
    if (classify(r.prompt_text, kind) === r.label) correct += 1;
  }
  const total = rows.length;
  return {
    correct,
    total,
    accuracy: total === 0 ? 0 : correct / total,
  };
}
