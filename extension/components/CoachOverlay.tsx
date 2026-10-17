import type { CSSProperties } from "react";
import { PipSvg } from "./PipSvg";
import { COACH_BUBBLE_MAX, COACH_RIGHT } from "../lib/coach";
import coachCopy from "../data/coach-copy.json";

type Props = {
  message: string;
  bottom?: number;
  onYes: () => void;
  onNo: () => void;
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

const row: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 10,
};

const btn: CSSProperties = {
  flex: 1,
  border: "none",
  borderRadius: 999,
  padding: "8px 14px",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

/** Floating coach card — Shadow DOM or fixture page. */
export function CoachOverlay({
  message,
  bottom = 16,
  onYes,
  onNo,
}: Props) {
  return (
    <div
      data-testid="coach-overlay"
      style={{ ...shell, bottom }}
    >
      <div data-testid="coach-bubble" style={bubble}>
        <p style={{ margin: 0 }}>{message}</p>
        <div style={row}>
          <button
            type="button"
            data-testid="coach-yes"
            style={{ ...btn, background: "#5fa8d3", color: "#1b4965" }}
            onClick={onYes}
          >
            {coachCopy.yes}
          </button>
          <button
            type="button"
            data-testid="coach-no"
            style={{ ...btn, background: "#bee9e8", color: "#1b4965" }}
            onClick={onNo}
          >
            {coachCopy.no}
          </button>
        </div>
      </div>
      <PipSvg size={72} talking />
    </div>
  );
}
