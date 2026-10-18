/** Token-only SVG Pip (issue #5). Hexes must match palette — scanned by tests. */
const BODY = "#62b6cb";
const BELLY = "#bee9e8";
const FACE = "#1b4965";
const CHEEK = "#5fa8d3";
const FIELD = "#cae9ff";

type Props = {
  size?: number;
  talking?: boolean;
  className?: string;
};

/** Rounded Codex-like blob. Idle bob / talk bounce via CSS class. */
export function PipSvg({ size = 72, talking = false, className }: Props) {
  return (
    <svg
      data-testid="pip-svg"
      data-talking={talking ? "true" : "false"}
      className={[
        "pip-svg",
        talking ? "pip-svg--talk" : "pip-svg--idle",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      width={size}
      height={size}
      viewBox="0 0 72 72"
      aria-label="Pip"
      role="img"
    >
      {/* soft field disc behind */}
      <circle cx="36" cy="40" r="30" fill={FIELD} />
      {/* body */}
      <ellipse cx="36" cy="40" rx="22" ry="24" fill={BODY} />
      {/* belly */}
      <ellipse cx="36" cy="44" rx="12" ry="14" fill={BELLY} />
      {/* eyes */}
      <circle cx="28" cy="34" r="3.2" fill={FACE} />
      <circle cx="44" cy="34" r="3.2" fill={FACE} />
      {/* cheeks */}
      <circle cx="22" cy="40" r="3" fill={CHEEK} opacity="0.85" />
      <circle cx="50" cy="40" r="3" fill={CHEEK} opacity="0.85" />
      {/* smile */}
      <path
        d="M28 46 Q36 52 44 46"
        fill="none"
        stroke={FACE}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const PIP_SVG_ALLOWED_HEX = [
  BODY,
  BELLY,
  FACE,
  CHEEK,
  FIELD,
] as const;
