import type { CoachClassifyResponse } from "./draftCoach";

export type ChalkVerdict = "suggest" | "decline" | "fallback";

/** A measured decline must not be overwritten by the local keyword rule. */
export function chalkVerdict(response: CoachClassifyResponse | null): ChalkVerdict {
  if (!response) return "fallback";
  if (response.action === "suggest_small") {
    return response.target?.model_id && response.target.website_label && response.ttl_ms > 0
      ? "suggest" : "fallback";
  }
  return ["below_threshold", "needs_big", "uncertain", "threshold_met", "already_lightweight"].includes(response.reason_code ?? "")
    ? "decline" : "fallback";
}

/** One verdict per draft; edits and sends resolve old waits without retaining listeners. */
export class VerdictBoard {
  private finish: ((verdict: ChalkVerdict) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  begin(waitMs = 1500): Promise<ChalkVerdict> {
    this.cancel();
    return new Promise((resolve) => {
      this.finish = resolve;
      this.timer = setTimeout(() => this.settle("fallback"), waitMs);
    });
  }

  settle(verdict: ChalkVerdict): void {
    clearTimeout(this.timer);
    const done = this.finish;
    this.finish = null;
    done?.(verdict);
  }

  cancel(): void { this.settle("fallback"); }
}
