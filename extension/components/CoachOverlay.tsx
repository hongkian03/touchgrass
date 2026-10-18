import type { CSSProperties, ReactNode } from "react";
import { BrandIcon } from "./BrandIcon";
import { COACH_BUBBLE_MAX, COACH_RIGHT, COACH_TOP } from "../lib/coach";
import type { CoachTargetDisplay } from "../lib/coachTargetDisplay";

type Props = {
  message: string;
  /** Platform chip for open-paste redirect. */
  target?: CoachTargetDisplay | null;
  /** Optional redirect details (reason, savings, cancel/hop controls, Chalk telemetry). */
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
  /** Hold-coach actions (Chalk suggest). */
  actions?: {
    onSwitch?: () => void;
    onSendAnyway?: () => void;
    switchLabel?: string;
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
    return (
      <BrandIcon
        slug={target.iconSlug}
        size={28}
        label={target.name}
        role="presentation"
      />
    );
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
export function CoachOverlay({
  message,
  target = null,
  redirectMeta = null,
  actions = null,
}: Props) {
  const isRedirect =
    Boolean(target) && !actions?.onSwitch && !actions?.onSendAnyway;

  const hasSavings =
    typeof redirectMeta?.savedWh === "number" && redirectMeta.savedWh > 0;
  const hasContext =
    typeof redirectMeta?.contextTurns === "number" &&
    redirectMeta.contextTurns > 0;
  const hasHoldSavings =
    typeof actions?.chalkMeta?.savedWh === "number" &&
    actions.chalkMeta.savedWh > 0;

  return (
    <div data-testid="coach-overlay" style={shell}>
      <style>{`
        @keyframes puddle-toast-progress {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
      <div data-testid="coach-bubble" style={{ ...bubble, position: "relative", overflow: "hidden" }}>
        {actions?.badge ? (
          <span data-testid="coach-mode-badge" style={badgeStyle}>
            {actions.badge}
          </span>
        ) : null}
        {isRedirect && target ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div data-testid="coach-redirect-chip" style={row}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: "#f4f4f5",
                  border: "1px solid #e4e4e7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <TargetIcon target={target} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>
                  {message}
                </p>
                {redirectMeta?.reason ? (
                  <p
                    data-testid="coach-redirect-reason"
                    style={{
                      margin: "2px 0 0",
                      fontSize: 11,
                      color: "#576574",
                      lineHeight: 1.25,
                    }}
                  >
                    {redirectMeta.reason}
                  </p>
                ) : null}
              </div>
            </div>

            {hasSavings || hasContext ? (
              <div
                data-testid="coach-redirect-savings"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                {hasSavings ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "2px 6px",
                      borderRadius: 999,
                      background: "#e8f6df",
                      color: "#2d5a27",
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    −{redirectMeta?.savedWh?.toFixed(1)} Wh
                    {typeof redirectMeta?.savedCo2G === "number" &&
                    redirectMeta.savedCo2G > 0
                      ? ` · −${redirectMeta.savedCo2G.toFixed(2)}g CO₂`
                      : ""}
                  </span>
                ) : null}
                {hasContext ? (
                  <span
                    data-testid="coach-context-pill"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2px 6px",
                      borderRadius: 999,
                      background: "#fff8dc",
                      color: "#8a5a00",
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    +{redirectMeta?.contextTurns} turn
                    {redirectMeta?.contextTurns === 1 ? "" : "s"} carried
                  </span>
                ) : null}
              </div>
            ) : null}

            {redirectMeta?.onCancel || redirectMeta?.onHopNow ? (
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                {redirectMeta.onCancel ? (
                  <button
                    type="button"
                    data-testid="coach-redirect-stay"
                    style={{
                      ...btn,
                      padding: "4px 8px",
                      fontSize: 11,
                      flex: 1,
                    }}
                    onClick={redirectMeta.onCancel}
                  >
                    Stay here
                  </button>
                ) : null}
                {redirectMeta.onHopNow ? (
                  <button
                    type="button"
                    data-testid="coach-redirect-now"
                    style={{
                      ...btn,
                      padding: "4px 8px",
                      fontSize: 11,
                      flex: 1,
                      background: "#1b4965",
                      color: "#fff",
                      borderColor: "#1b4965",
                    }}
                    onClick={redirectMeta.onHopNow}
                  >
                    Hop now ↗
                  </button>
                ) : null}
              </div>
            ) : null}

            {redirectMeta?.durationMs ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 3,
                  background: "#eef1f4",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: "100%",
                    background: "#5cb85c",
                    transformOrigin: "left center",
                    animation: `puddle-toast-progress ${redirectMeta.durationMs}ms linear forwards`,
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <p style={{ margin: 0, fontWeight: 600 }}>{message}</p>
            {target ? (
              <div data-testid="coach-redirect-chip" style={chip}>
                <TargetIcon target={target} />
                <span style={{ fontWeight: 600 }}>{target.name}</span>
              </div>
            ) : null}
            {hasHoldSavings && actions?.chalkMeta?.savedWh ? (
              <div
                data-testid="coach-chalk-telemetry"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 4,
                  marginTop: 6,
                }}
              >
                <span
                  style={{
                    padding: "2px 6px",
                    borderRadius: 999,
                    background: "#e8f6df",
                    color: "#2d5a27",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  −{actions.chalkMeta.savedWh.toFixed(1)} Wh
                </span>
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
