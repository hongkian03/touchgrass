import type { CSSProperties, ReactNode } from "react";
import { BrandIcon } from "./BrandIcon";
import { COACH_BUBBLE_MAX, COACH_RIGHT, COACH_TOP } from "../lib/coach";
import type { CoachTargetDisplay } from "../lib/coachTargetDisplay";

type Props = {
  message: string;
  /** Platform chip for open-paste redirect. */
  target?: CoachTargetDisplay | null;
  /** Hold-coach actions (Chalk suggest). */
  actions?: {
    onSwitch?: () => void;
    onSendAnyway?: () => void;
    switchLabel?: string;
    badge?: string | null;
  } | null;
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

/** White card — matches onboarding / popup surface, not pale-sky blue. */
const bubble: CSSProperties = {
  maxWidth: COACH_BUBBLE_MAX,
  width: "max-content",
  padding: "12px 14px",
  borderRadius: 12,
  background: "#ffffff",
  color: "#1b4965",
  fontSize: 13,
  lineHeight: 1.35,
  border: "1px solid #e4e4e7",
  boxShadow: "0 4px 16px rgba(27, 73, 101, 0.08)",
};

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const chip: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 8,
  padding: 0,
  background: "transparent",
};

const btnRow: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 10,
  flexWrap: "wrap",
};

const btn: CSSProperties = {
  border: "1px solid #e4e4e7",
  background: "#fff",
  color: "#1b4965",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const badgeStyle: CSSProperties = {
  display: "inline-block",
  marginBottom: 6,
  padding: "2px 6px",
  borderRadius: 6,
  background: "#f4f4f5",
  color: "#1b4965",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.3,
};

function TargetIcon({ target }: { target: CoachTargetDisplay }): ReactNode {
  if (target.iconSlug) {
    return <BrandIcon slug={target.iconSlug} size={28} label={target.name} />;
  }
  if (target.faviconUrl) {
    return (
      <img
        src={target.faviconUrl}
        alt=""
        width={28}
        height={28}
        style={{ width: 28, height: 28, borderRadius: 6, display: "block" }}
      />
    );
  }
  return null;
}

/** Compact top-right toast. No pet. White surface + brand logo. */
export function CoachOverlay({ message, target = null, actions = null }: Props) {
  const isRedirect =
    Boolean(target) && !actions?.onSwitch && !actions?.onSendAnyway;

  return (
    <div data-testid="coach-overlay" style={shell}>
      <div data-testid="coach-bubble" style={bubble}>
        {actions?.badge ? (
          <span data-testid="coach-mode-badge" style={badgeStyle}>
            {actions.badge}
          </span>
        ) : null}
        {isRedirect && target ? (
          <div data-testid="coach-redirect-chip" style={row}>
            <TargetIcon target={target} />
            <p style={{ margin: 0 }}>{message}</p>
          </div>
        ) : (
          <>
            <p style={{ margin: 0 }}>{message}</p>
            {target ? (
              <div data-testid="coach-redirect-chip" style={chip}>
                <TargetIcon target={target} />
                <span style={{ fontWeight: 600 }}>{target.name}</span>
              </div>
            ) : null}
          </>
        )}
        {actions?.onSwitch || actions?.onSendAnyway ? (
          <div style={btnRow}>
            {actions.onSwitch ? (
              <button
                type="button"
                data-testid="coach-switch"
                style={btn}
                onClick={actions.onSwitch}
              >
                {actions.switchLabel || "Switch"}
              </button>
            ) : null}
            {actions.onSendAnyway ? (
              <button
                type="button"
                data-testid="coach-send-anyway"
                style={{
                  ...btn,
                  background: "#1b4965",
                  color: "#fff",
                  borderColor: "#1b4965",
                }}
                onClick={actions.onSendAnyway}
              >
                Send anyway
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
