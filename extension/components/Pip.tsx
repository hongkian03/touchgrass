type Props = {
  size?: number;
  talking?: boolean;
  className?: string;
};

/** Codex-like rounded mascot. Fills only from Puddle tokens. */
export function Pip({ size = 96, talking = false, className }: Props) {
  const cheekOpacity = talking ? 0.95 : 0.55;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Pip"
      data-testid="pip"
    >
      {/* field glow */}
      <ellipse cx="48" cy="88" rx="28" ry="5" fill="var(--pale-sky)" />
      {/* body */}
      <ellipse cx="48" cy="52" rx="30" ry="28" fill="var(--pacific-blue)" />
      {/* belly */}
      <ellipse cx="48" cy="58" rx="16" ry="14" fill="var(--frozen-water)" />
      {/* cheeks */}
      <circle
        cx="30"
        cy="52"
        r="6"
        fill="var(--fresh-sky)"
        opacity={cheekOpacity}
      />
      <circle
        cx="66"
        cy="52"
        r="6"
        fill="var(--fresh-sky)"
        opacity={cheekOpacity}
      />
      {/* eyes */}
      <circle cx="38" cy="46" r="4" fill="var(--yale-blue)" />
      <circle cx="58" cy="46" r="4" fill="var(--yale-blue)" />
      <circle cx="39.2" cy="44.8" r="1.2" fill="var(--frozen-water)" />
      <circle cx="59.2" cy="44.8" r="1.2" fill="var(--frozen-water)" />
      {/* smile */}
      <path
        d="M40 58 Q48 64 56 58"
        fill="none"
        stroke="var(--yale-blue)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
