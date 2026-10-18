/** Draft-only coaching boundary. The site adapter owns capture, rendering and consent UI. */
export class DraftCoach {
  constructor({ classify, emit = () => {}, display = () => {}, now = () => Date.now(), debounceMs = 400,
    expectedProfileVersion = null, expectedPolicyVersion = null }) {
    Object.assign(this, { classify, emit, display, now, debounceMs, expectedProfileVersion, expectedPolicyVersion });
    this.generation = 0;
    this.ready = null;
    this.current = null;
  }

  identity(draft) {
    return JSON.stringify([draft.request_id, draft.draft_revision, draft.conversation_id,
      draft.site, draft.current_model_label, draft.prompt_text, draft.recent_messages,
      draft.context_available, draft.context_truncated, draft.has_attachments,
      draft.uses_tools, draft.modality, draft.target_available, draft.opted_in]);
  }

  invalidate() {
    this.generation += 1;
    clearTimeout(this.timer);
    clearTimeout(this.expiryTimer);
    this.controller?.abort();
    this.ready = null;
    this.display(null);
  }

  update(draft) {
    this.invalidate();
    const snapshot = structuredClone(draft);
    this.current = snapshot;
    if (!snapshot.opted_in) return;
    const generation = this.generation;
    this.timer = setTimeout(() => this.fetchDraft(snapshot, generation), this.debounceMs);
  }

  async fetchDraft(draft, generation) {
    const controller = new AbortController();
    this.controller = controller;
    const requestedAt = this.now();
    const cutoff = setTimeout(() => controller.abort(), 800);
    try {
      const response = await this.classify(draft, controller.signal);
      if (response.request_id !== draft.request_id || response.draft_revision !== draft.draft_revision ||
          response.conversation_id !== draft.conversation_id || response.site !== draft.site ||
          response.current_model_label !== draft.current_model_label) return;
      if (generation !== this.generation || controller.signal.aborted ||
          this.now() - requestedAt >= 800 || this.identity(this.current) !== this.identity(draft)) {
        if (generation === this.sentGeneration) this.safeEmit('late_result', response);
        return;
      }
      if ((this.expectedProfileVersion && response.profile_version !== this.expectedProfileVersion) ||
          (this.expectedPolicyVersion && response.policy_version !== this.expectedPolicyVersion)) return;
      if (response.action !== 'suggest_small' || !response.target || response.ttl_ms <= 0) return;
      this.ready = { response, expiresAt: requestedAt + response.ttl_ms };
      if (this.now() >= this.ready.expiresAt) { this.ready = null; return; }
      this.display(response);
      this.safeEmit('shown', response);
      this.expiryTimer = setTimeout(() => {
        if (this.ready?.response.decision_id === response.decision_id) {
          this.safeEmit('expired', response);
          this.ready = null;
          this.display(null);
        }
      }, this.ready.expiresAt - this.now());
    } catch {
      // Original site submission is independent of coaching success.
    } finally {
      clearTimeout(cutoff);
    }
  }

  safeEmit(event_type, response) {
    try { Promise.resolve(this.emit(event_type, response)).catch(() => {}); } catch { /* advisory telemetry */ }
  }

  onSend() {
    // Synchronous, never preventDefault and never await a network operation.
    const ready = this.ready && this.now() < this.ready.expiresAt ? this.ready.response : null;
    this.sentGeneration = this.generation;
    if (ready) this.safeEmit('sent_anyway', ready);
    this.invalidate();
    return ready;
  }

  navigate() { this.current = null; this.invalidate(); }
}
