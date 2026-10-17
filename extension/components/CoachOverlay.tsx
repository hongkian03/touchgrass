import type { CSSProperties, ReactNode } from "react";
import { BrandIcon } from "./BrandIcon";
import { COACH_BUBBLE_MAX, COACH_RIGHT, COACH_TOP } from "../lib/coach";
import type { CoachTargetDisplay } from "../lib/coachTargetDisplay";

type Props = {
  message: string;
  /** Platform chip for open-paste redirect. */
  target?: CoachTargetDisplay | null;
};

const shell: CSSProperties = {
  position: "fixed",
  top: COACH_TOP,
  right: COACH_RIGHT,
  zIndex: 2147483646,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  fontFamily: '"Geist", ui-sans-serif, system-ui, sans-serif',
  pointerEvents: "auto",
};

const bubble: CSSProperties = {
  maxWidth: COACH_BUBBLE_MAX,
  width: "max-content",
  padding: "10px 12px",
  borderRadius: 12,
  background: "#cae9ff",
  color: "#1b4965",
  fontSize: 13,
  lineHeight: 1.35,
  boxShadow: "0 6px 18px rgba(27, 73, 101, 0.16)",
};

const chip: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 8,
  padding: "6px 8px",
  borderRadius: 10,
  background: "rgba(255, 255, 255, 0.7)",
};

function TargetChip({ target }: { target: CoachTargetDisplay }): ReactNode {
  let icon: ReactNode = null;
  if (target.iconSlug) {
    const slug = target.iconSlug;
    if (slug === "gemini" || slug === "gemini-google" || slug === "google-gemini") {
      const src =
        typeof browser !== "undefined" && browser.runtime?.getURL
          ? browser.runtime.getURL("/icons/gemini.svg")
          : "/icons/gemini.svg";
      icon = (
        <img
          src={src}
          alt=""
          width={22}
          height={22}
          style={{ width: 22, height: 22, display: "block", objectFit: "contain" }}
        />
      );
    } else {
      icon = <BrandIcon slug={slug} size={22} label={target.name} />;
    }
  } else if (target.faviconUrl) {
    icon = (
      <img
        src={target.faviconUrl}
        alt=""
        width={22}
        height={22}
        style={{ width: 22, height: 22, borderRadius: 5, display: "block" }}
      />
    );
  }

  return (
    <div data-testid="coach-redirect-chip" style={chip}>
      {icon}
      <span style={{ fontWeight: 600 }}>{target.name}</span>
    </div>
  );
}

/** Compact top-right toast. No pet. */
export function CoachOverlay({ message, target = null }: Props) {
  return (
    <div data-testid="coach-overlay" style={shell}>
      <div data-testid="coach-bubble" style={bubble}>
        <p style={{ margin: 0 }}>{message}</p>
        {target ? <TargetChip target={target} /> : null}
      </div>
    </div>
  );
}
