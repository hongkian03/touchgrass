import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { CoachOverlay } from "../components/CoachOverlay";
import type { CoachTargetDisplay } from "./coachTargetDisplay";

const HOST_ID = "puddle-coach-host";

export type CoachMountOpts = {
  message: string;
  composer?: Element | null;
  target?: CoachTargetDisplay | null;
  /** false = light DOM (fixture). true = Shadow DOM (live pages). */
  shadow?: boolean;
  actions?: {
    onSwitch?: () => void;
    onSendAnyway?: () => void;
    switchLabel?: string;
    badge?: string | null;
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
      actions: opts.actions ?? null,
    }),
  );
  return host;
}
