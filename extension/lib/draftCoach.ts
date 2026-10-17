/** Capture-phase hold coach (Option A). Port of coaching-client.mjs + Send hold. */

export type CoachDraft = {
  request_id: string;
  draft_revision: number;
  conversation_id: string;
  site: string;
  current_model_label: string;
  prompt_text: string;
  recent_messages: unknown[];
  context_available: boolean;
  context_truncated: boolean;
  has_attachments: boolean;
  uses_tools: boolean;
  modality: string;
  target_available: boolean;
  opted_in: boolean;
};

export type CoachClassifyResponse = {
  request_id: string;
  draft_revision: number;
  conversation_id: string;
  site: string;
  current_model_label: string;
  action: string;
  target?: { label?: string; model?: string } | null;
  ttl_ms: number;
  decision_id: string;
  profile_version?: string;
  policy_version?: string;
  estimated_savings?: unknown;
  mode?: string;
};

export type DraftCoachHooks = {
  classify: (
    draft: CoachDraft,
    signal: AbortSignal,
  ) => Promise<CoachClassifyResponse>;
  emit?: (eventType: string, response: CoachClassifyResponse) => unknown;
  display?: (response: CoachClassifyResponse | null) => void;
  now?: () => number;
  debounceMs?: number;
  expectedProfileVersion?: string | null;
  expectedPolicyVersion?: string | null;
  /** Max wait on Send before releasing (ms). */
  holdMs?: number;
};

export class DraftCoach {
  classify: DraftCoachHooks["classify"];
  emit: NonNullable<DraftCoachHooks["emit"]>;
  display: NonNullable<DraftCoachHooks["display"]>;
  now: () => number;
  debounceMs: number;
  holdMs: number;
  expectedProfileVersion: string | null;
  expectedPolicyVersion: string | null;
  generation = 0;
  sentGeneration: number | undefined;
  ready: { response: CoachClassifyResponse; expiresAt: number } | null = null;
  current: CoachDraft | null = null;
  timer: ReturnType<typeof setTimeout> | undefined;
  expiryTimer: ReturnType<typeof setTimeout> | undefined;
  controller: AbortController | undefined;
  /** Bypass one programmatic send after Switch. */
  bypassHoldOnce = false;

  constructor(hooks: DraftCoachHooks) {
    this.classify = hooks.classify;
    this.emit = hooks.emit ?? (() => {});
    this.display = hooks.display ?? (() => {});
    this.now = hooks.now ?? (() => Date.now());
    this.debounceMs = hooks.debounceMs ?? 400;
    this.holdMs = hooks.holdMs ?? 800;
    this.expectedProfileVersion = hooks.expectedProfileVersion ?? null;
    this.expectedPolicyVersion = hooks.expectedPolicyVersion ?? null;
  }

  identity(draft: CoachDraft): string {
    return JSON.stringify([
      draft.request_id,
      draft.draft_revision,
      draft.conversation_id,
      draft.site,
      draft.current_model_label,
      draft.prompt_text,
      draft.recent_messages,
      draft.context_available,
      draft.context_truncated,
      draft.has_attachments,
      draft.uses_tools,
      draft.modality,
      draft.target_available,
      draft.opted_in,
    ]);
  }

  invalidate(): void {
    this.generation += 1;
    clearTimeout(this.timer);
    clearTimeout(this.expiryTimer);
    this.controller?.abort();
    this.ready = null;
    this.display(null);
  }

  update(draft: CoachDraft): void {
    this.invalidate();
    const snapshot = structuredClone(draft);
    this.current = snapshot;
    if (!snapshot.opted_in) return;
    const generation = this.generation;
    this.timer = setTimeout(
      () => void this.fetchDraft(snapshot, generation),
      this.debounceMs,
    );
  }

  async fetchDraft(draft: CoachDraft, generation: number): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    const requestedAt = this.now();
    const cutoff = setTimeout(() => controller.abort(), this.holdMs);
    try {
      const response = await this.classify(draft, controller.signal);
      if (
        response.request_id !== draft.request_id ||
        response.draft_revision !== draft.draft_revision ||
        response.conversation_id !== draft.conversation_id ||
        response.site !== draft.site ||
        response.current_model_label !== draft.current_model_label
      ) {
        return;
      }
      if (
        generation !== this.generation ||
        controller.signal.aborted ||
        this.now() - requestedAt >= this.holdMs ||
        !this.current ||
        this.identity(this.current) !== this.identity(draft)
      ) {
        if (generation === this.sentGeneration) {
          this.safeEmit("late_result", response);
        }
        return;
      }
      if (
        (this.expectedProfileVersion &&
          response.profile_version !== this.expectedProfileVersion) ||
        (this.expectedPolicyVersion &&
          response.policy_version !== this.expectedPolicyVersion)
      ) {
        return;
      }
      if (
        response.action !== "suggest_small" ||
        !response.target ||
        response.ttl_ms <= 0
      ) {
        return;
      }
      this.ready = { response, expiresAt: requestedAt + response.ttl_ms };
      if (this.now() >= this.ready.expiresAt) {
        this.ready = null;
        return;
      }
      this.display(response);
      this.safeEmit("shown", response);
      this.expiryTimer = setTimeout(() => {
        if (this.ready?.response.decision_id === response.decision_id) {
          this.safeEmit("expired", response);
          this.ready = null;
          this.display(null);
        }
      }, this.ready.expiresAt - this.now());
    } catch {
      // submission independent of coaching
    } finally {
      clearTimeout(cutoff);
    }
  }

  safeEmit(eventType: string, response: CoachClassifyResponse): void {
    try {
      Promise.resolve(this.emit(eventType, response)).catch(() => {});
    } catch {
      /* advisory */
    }
  }

  /** Sync path (never preventDefault). */
  onSend(): CoachClassifyResponse | null {
    const ready =
      this.ready && this.now() < this.ready.expiresAt ? this.ready.response : null;
    this.sentGeneration = this.generation;
    if (ready) this.safeEmit("sent_anyway", ready);
    this.invalidate();
    return ready;
  }

  /**
   * Capture-phase hold: preventDefault, wait ≤holdMs for classify, then
   * return ready suggestion or null (caller releases original send).
   */
  async holdSend(
    draft: CoachDraft,
  ): Promise<CoachClassifyResponse | null> {
    if (this.bypassHoldOnce) {
      this.bypassHoldOnce = false;
      this.invalidate();
      return null;
    }
    if (!draft.opted_in) {
      return this.onSend();
    }
    // Prefer already-ready advice
    if (this.ready && this.now() < this.ready.expiresAt) {
      return this.ready.response;
    }
    this.sentGeneration = this.generation;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const requestedAt = this.now();
    const cutoff = setTimeout(() => controller.abort(), this.holdMs);
    try {
      const response = await this.classify(draft, controller.signal);
      if (
        generation !== this.generation ||
        this.now() - requestedAt >= this.holdMs
      ) {
        this.safeEmit("late_result", response);
        return null;
      }
      if (
        response.action === "suggest_small" &&
        response.target &&
        response.ttl_ms > 0
      ) {
        this.ready = {
          response,
          expiresAt: this.now() + response.ttl_ms,
        };
        this.display(response);
        this.safeEmit("shown", response);
        return response;
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(cutoff);
    }
  }

  armBypass(): void {
    this.bypassHoldOnce = true;
  }

  navigate(): void {
    this.current = null;
    this.invalidate();
  }
}
