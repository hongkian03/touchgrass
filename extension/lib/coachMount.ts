import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { CoachOverlay } from "../components/CoachOverlay";
import type { CoachTargetDisplay } from "./coachTargetDisplay";

const HOST_ID = "puddle-coach-host";

export type CoachMountOpts = {
  message: string;
  composer?: Element | null;
  target?: CoachTargetDisplay | null;
  redirectMeta?: {
    reason?: string | null;
    fromPlatform?: string | null;
    savedWh?: number | null;
    savedCo2G?: number | null;
    savedWaterMl?: number | null;
    chalkPill?: string | null;
    smallOkPct?: number | null;
    contextTurns?: number | null;
    sameSiteModel?: string | null;
    durationMs?: number;
    onCancel?: () => void;
    onHopNow?: () => void;
    onSwitchSameSite?: () => void;
  } | null;
  /** false = light DOM (fixture). true = Shadow DOM (live pages). */
  shadow?: boolean;
  actions?: {
    onSwitch?: () => void;
    onSendAnyway?: () => void;
    onOpenOther?: () => void;
    switchLabel?: string;
    openOtherLabel?: string;
    sendAnywayLabel?: string;
    note?: string | null;
    badge?: string | null;
    chalkMeta?: {
      confidencePct?: number | null;
      smallOkPct?: number | null;
      elapsedMs?: number | null;
      policyVersion?: string | null;
      featureGroup?: string | null;
      savedWh?: number | null;
      savedCo2G?: number | null;
    } | null;
  } | null;
};

let root: Root | null = null;

export function unmountCoach(): void {
  root?.unmount();
  root = null;
  document.getElementById(HOST_ID)?.remove();
}

export function mountCoach(opts: CoachMountOpts): HTMLElement {
  unmountCoach();
  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);

  const mountPoint =
    opts.shadow !== false
      ? (() => {
          const shadow = host.attachShadow({ mode: "open" });
          const inner = document.createElement("div");
          shadow.appendChild(inner);
          return inner;
        })()
      : host;

  root = createRoot(mountPoint);
  root.render(
    createElement(CoachOverlay, {
      message: opts.message,
      target: opts.target ?? null,
      redirectMeta: opts.redirectMeta ?? null,
      actions: opts.actions ?? null,
    }),
  );
  return host;
}
