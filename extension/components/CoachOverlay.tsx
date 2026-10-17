import type { CSSProperties, ReactNode } from "react";
import { PipSvg } from "./PipSvg";
import { BrandIcon } from "./BrandIcon";
import { COACH_BUBBLE_MAX, COACH_RIGHT } from "../lib/coach";
import type { CoachTargetDisplay } from "../lib/coachTargetDisplay";

type Props = {
  message: string;
  bottom?: number;
  /** Platform chip for open-paste redirect. */
  target?: CoachTargetDisplay | null;
};

const shell: CSSProperties = {
  position: "fixed",
  right: COACH_RIGHT,
  zIndex: 2147483646,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 8,
  fontFamily: '"Geist", ui-sans-serif, system-ui, sans-serif',
  pointerEvents: "auto",
};

const bubble: CSSProperties = {
  maxWidth: COACH_BUBBLE_MAX,
  width: "max-content",
  padding: "12px 14px",
  borderRadius: 16,
  background: "#cae9ff",
  color: "#1b4965",
  fontSize: 14,
  lineHeight: 1.35,
  boxShadow: "0 8px 24px rgba(27, 73, 101, 0.18)",
};

const chip: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginTop: 10,
  padding: "8px 10px",
  borderRadius: 12,
  background: "rgba(255, 255, 255, 0.65)",
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
          width={28}
          height={28}
          style={{ width: 28, height: 28, display: "block", objectFit: "contain" }}
        />
      );
    } else {
      icon = <BrandIcon slug={slug} size={28} label={target.name} />;
    }
  } else if (target.faviconUrl) {
    icon = (
      <img
        src={target.faviconUrl}
        alt=""
        width={28}
        height={28}
        style={{ width: 28, height: 28, borderRadius: 6, display: "block" }}
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

/** Floating coach card. Auto-informs; no Yes/No. */
export function CoachOverlay({ message, bottom = 16, target = null }: Props) {
  return (
    <div data-testid="coach-overlay" style={{ ...shell, bottom }}>
      <div data-testid="coach-bubble" style={bubble}>
        <p style={{ margin: 0 }}>{message}</p>
        {target ? <TargetChip target={target} /> : null}
      </div>
      <PipSvg size={72} talking />
    </div>
  );
}
