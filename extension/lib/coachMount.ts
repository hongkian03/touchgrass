import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { CoachOverlay } from "../components/CoachOverlay";
import { coachBottomPx } from "./coach";

const HOST_ID = "puddle-coach-host";

const SHADOW_CSS = `
  .pip-svg--idle { animation: pip-bob 2.4s ease-in-out infinite; }
  .pip-svg--talk { animation: pip-talk 0.55s ease-in-out infinite; }
  @keyframes pip-bob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  @keyframes pip-talk {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-6px) scale(1.04); }
  }
`;

export type CoachMountOpts = {
  message: string;
  composer?: Element | null;
  onYes: () => void;
  onNo: () => void;
  /** false = light DOM (fixture). true = Shadow DOM (live pages). */
  shadow?: boolean;
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

  const mountPoint = opts.shadow !== false
    ? (() => {
        const shadow = host.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = SHADOW_CSS;
        shadow.appendChild(style);
        const inner = document.createElement("div");
        shadow.appendChild(inner);
        return inner;
      })()
    : host;

  const bottom = coachBottomPx(opts.composer ?? null);
  root = createRoot(mountPoint);
  root.render(
    createElement(CoachOverlay, {
      message: opts.message,
      bottom,
      onYes: opts.onYes,
      onNo: opts.onNo,
    }),
  );
  return host;
}
