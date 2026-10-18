/**
 * Hand-drawn footprint icons: ink linework with a slight brush wobble and
 * off-white paper-cut fills, drawn to sit on a pastel tile.
 *
 * Motion is unchanged: every animation class (.ft-glow, .ft-orbit, .ft-spark*,
 * .ft-bolt, .ft-drop, .ft-ripple*, .ft-splash, .ft-drip, .ft-cloud,
 * .ft-puffball, .ft-tree, .ft-sway, .ft-leaf) sits on the same group as before.
 * The cartoon faces (eyes and their blink) were removed for the hand-drawn style.
 */

/** Theme tokens with fallbacks for pages without the popup theme (dashboard). */
export const INK = "var(--tg-ink, #161616)";
export const PAPER = "var(--tg-paper, #faf8f2)";
const INK_W = 3.2;

/** Shared brush wobble; identical in every icon, so duplicate ids are harmless. */
export const ROUGH = "url(#tg-ink-rough)";
export function InkDefs() {
  return (
    <defs>
      <filter id="tg-ink-rough" x="-15%" y="-15%" width="130%" height="130%">
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  );
}

/** Ink stroke props: round, slightly heavy, roughened. */
export const ink = {
  fill: "none",
  stroke: INK,
  strokeWidth: INK_W,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  filter: ROUGH,
};

/** Paper-cut shape with an ink outline. */
export const paper = {
  fill: PAPER,
  stroke: INK,
  strokeWidth: INK_W,
  strokeLinejoin: "round" as const,
  filter: ROUGH,
};

type SizeProps = { size?: number };

export function EnergyBolt({ size = 72 }: SizeProps) {
  return (
    <svg
      data-testid="cartoon-energy"
      width={size}
      height={size}
      viewBox="0 0 72 72"
      aria-label="energy"
      role="img"
      overflow="visible"
    >
      <InkDefs />
      <circle className="ft-glow" cx="36" cy="36" r="24" fill={PAPER} opacity="0.55" filter={ROUGH} />
      <g className="ft-orbit">
        <path className="ft-spark" d="M9 20 L14 23" {...ink} />
        <path className="ft-spark ft-spark--mid" d="M63 18 L58 22" {...ink} />
        <path className="ft-spark ft-spark--late" d="M62 52 L57 49" {...ink} />
      </g>
      <g className="ft-bolt">
        <path d="M40 8 L19 37 H32 L27 63 L54 30 H40 Z" {...paper} />
      </g>
    </svg>
  );
}

export function WaterDrop({ size = 72 }: SizeProps) {
  return (
    <svg
      data-testid="cartoon-water"
      width={size}
      height={size}
      viewBox="0 0 72 72"
      aria-label="water"
      role="img"
      overflow="visible"
    >
      <InkDefs />
      <ellipse className="ft-ripple" cx="36" cy="60" rx="20" ry="4.5" {...ink} />
      <ellipse className="ft-ripple ft-ripple--late" cx="36" cy="60" rx="11" ry="2.6" {...ink} strokeWidth={2.4} />
      <circle className="ft-splash" cx="19" cy="52" r="2.2" fill={INK} />
      <circle className="ft-splash ft-spark--mid" cx="53" cy="50" r="1.9" fill={INK} />
      <circle className="ft-drip" cx="36" cy="6" r="2.6" fill={INK} />
      <g className="ft-drop">
        <path
          d="M36 12 C35 14 17 34 17 46 C17 57 25 63 36 63 C47 63 55 57 55 46 C55 34 37 14 36 12 Z"
          {...paper}
        />
        <path d="M26 44 C26 39 29 34 32 31" {...ink} strokeWidth={2.6} />
      </g>
    </svg>
  );
}

export function Co2Cloud({ size = 72 }: SizeProps) {
  return (
    <svg
      data-testid="cartoon-co2"
      width={size}
      height={size}
      viewBox="0 0 72 72"
      aria-label="carbon dioxide"
      role="img"
      overflow="visible"
    >
      <InkDefs />
      <circle className="ft-puffball" cx="15" cy="50" r="3.6" {...ink} strokeWidth={2.4} />
      <circle className="ft-puffball ft-spark--mid" cx="57" cy="52" r="3" {...ink} strokeWidth={2.4} />
      <g className="ft-cloud">
        <path
          d="M18 48 C10 48 10 36 19 36 C19 27 30 23 36 29 C40 21 54 23 53 34 C62 34 62 48 53 48 Z"
          {...paper}
        />
        {/* scribbled "CO2" mark */}
        <path d="M28 41 C25 37 31 35 31 39 M35 38 C33 41 38 42 37 38 C37 36 35 36 35 38 M41 41 L44 41 L41 44 L44 44" {...ink} strokeWidth={2} />
      </g>
    </svg>
  );
}

export function TreeGrove({ size = 72, count = 1 }: SizeProps & { count?: number }) {
  const n = Math.min(5, Math.max(0, Math.round(count)));
  const trees = n === 0 ? [0] : Array.from({ length: n }, (_, i) => i);
  const dim = n === 0;
  const used =
    n <= 1 ? [0] : n === 2 ? [-12, 12] : n === 3 ? [-16, 0, 16] : [-20, -10, 0, 10, 20].slice(0, n);

  return (
    <svg
      data-testid="cartoon-trees"
      data-tree-count={n}
      width={size}
      height={size}
      viewBox="0 0 72 72"
      aria-label="trees planted"
      role="img"
      overflow="visible"
    >
      <InkDefs />
      <path d="M10 57 C24 55 48 58 62 56" {...ink} />
      {trees.map((i) => {
        const x = 36 + (used[i] ?? 0);
        const scale = n <= 1 ? 1 : 0.7 + (i % 3) * 0.1;
        return (
          <g
            key={i}
            opacity={dim ? 0.35 : 1}
            transform={`translate(${x} 56) scale(${scale})`}
          >
            <g className="ft-tree" style={{ animationDelay: `${i * 140}ms` }}>
              <g className="ft-sway" style={{ animationDelay: `${i * 180}ms` }}>
                <path d="M0 0 C-1 -10 1 -18 0 -30" {...ink} />
                <path d="M0 -14 C-6 -14 -13 -19 -13 -25 C-7 -25 -1 -21 0 -14 Z" {...paper} />
                <path d="M0 -22 C6 -22 13 -27 13 -33 C7 -33 1 -29 0 -22 Z" {...paper} />
                <circle className="ft-leaf" cx="-8" cy="-34" r="1.8" fill={INK} />
                <circle className="ft-leaf ft-spark--late" cx="7" cy="-40" r="1.6" fill={INK} />
              </g>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
