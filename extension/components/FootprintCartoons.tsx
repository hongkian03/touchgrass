/** Real-world cartoon colors (not the 5 Pip tokens). */
const ENERGY_FIELD = "#fff3c4";
const ENERGY_BOLT = "#f5c400";
const ENERGY_HI = "#ffe566";
const ENERGY_FACE = "#8a5a00";

const WATER_FIELD = "#d6f0ff";
const WATER_DROP = "#2ba4e0";
const WATER_HI = "#9ad8f5";
const WATER_FACE = "#0b4f74";

const CO2_FIELD = "#eef1f4";
const CO2_BODY = "#c5cdd4";
const CO2_DARK = "#8e99a4";
const CO2_FACE = "#4a5560";

const TREE_FIELD = "#e4f5d8";
const TREE_LEAF = "#5cb85c";
const TREE_LEAF_DK = "#3d8b40";
const TREE_LEAF_LT = "#8fd18f";
const TREE_TRUNK = "#8b5a2b";
const TREE_FACE = "#2d5a27";

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
    >
      <circle className="ft-glow" cx="36" cy="36" r="30" fill={ENERGY_FIELD} />
      <g className="ft-orbit">
        <circle className="ft-spark" cx="10" cy="22" r="2.4" fill={ENERGY_HI} />
        <circle className="ft-spark ft-spark--mid" cx="62" cy="20" r="2" fill={ENERGY_BOLT} />
        <circle className="ft-spark ft-spark--late" cx="60" cy="50" r="2.2" fill={ENERGY_HI} />
      </g>
      <g className="ft-bolt">
        <path
          d="M40 8 L18 36 H32 L28 62 L56 30 H40 Z"
          fill={ENERGY_BOLT}
          stroke={ENERGY_FACE}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <ellipse cx="30" cy="30" rx="4" ry="5" fill={ENERGY_HI} opacity="0.9" />
        <g className="ft-eyes">
          <ellipse className="ft-eye" cx="30" cy="34" rx="2.1" ry="2.4" fill={ENERGY_FACE} />
          <ellipse className="ft-eye ft-eye--late" cx="42" cy="32" rx="2.1" ry="2.4" fill={ENERGY_FACE} />
        </g>
        <path
          d="M30 42 Q36 46 43 40"
          fill="none"
          stroke={ENERGY_FACE}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
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
    >
      <circle cx="36" cy="36" r="30" fill={WATER_FIELD} />
      <ellipse className="ft-ripple" cx="36" cy="58" rx="20" ry="5" fill={WATER_DROP} />
      <ellipse className="ft-ripple ft-ripple--late" cx="36" cy="58" rx="12" ry="3" fill={WATER_HI} />
      <circle className="ft-splash" cx="20" cy="52" r="2" fill={WATER_HI} />
      <circle className="ft-splash ft-spark--mid" cx="52" cy="50" r="1.8" fill={WATER_DROP} />
      <circle className="ft-drip" cx="36" cy="6" r="2.6" fill={WATER_DROP} />
      <g className="ft-drop">
        <path
          d="M36 12 C36 12 16 34 16 46 C16 57 25 64 36 64 C47 64 56 57 56 46 C56 34 36 12 36 12 Z"
          fill={WATER_DROP}
          stroke={WATER_FACE}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <ellipse cx="28" cy="40" rx="6" ry="8" fill={WATER_HI} opacity="0.95" />
        <g className="ft-eyes">
          <ellipse className="ft-eye" cx="28" cy="42" rx="2.2" ry="2.5" fill={WATER_FACE} />
          <ellipse className="ft-eye ft-eye--late" cx="42" cy="42" rx="2.2" ry="2.5" fill={WATER_FACE} />
        </g>
        <circle cx="24" cy="48" r="2.4" fill={WATER_HI} opacity="0.85" />
        <circle cx="46" cy="48" r="2.4" fill={WATER_HI} opacity="0.85" />
        <path
          d="M30 52 Q36 56 42 52"
          fill="none"
          stroke={WATER_FACE}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
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
    >
      <circle cx="36" cy="36" r="30" fill={CO2_FIELD} />
      <circle className="ft-puffball" cx="16" cy="48" r="4" fill={CO2_BODY} />
      <circle className="ft-puffball ft-spark--mid" cx="56" cy="50" r="3.4" fill={CO2_DARK} />
      <g className="ft-cloud">
        <ellipse cx="30" cy="40" rx="18" ry="13" fill={CO2_BODY} />
        <ellipse cx="46" cy="38" rx="15" ry="12" fill={CO2_DARK} />
        <ellipse cx="36" cy="30" rx="13" ry="11" fill={CO2_BODY} />
        <g className="ft-eyes">
          <ellipse className="ft-eye" cx="28" cy="36" rx="2.3" ry="2.6" fill={CO2_FACE} />
          <ellipse className="ft-eye ft-eye--late" cx="44" cy="34" rx="2.3" ry="2.6" fill={CO2_FACE} />
        </g>
        <path
          d="M30 44 Q36 48 44 43"
          fill="none"
          stroke={CO2_FACE}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
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
    >
      <circle cx="36" cy="36" r="30" fill={TREE_FIELD} />
      <ellipse cx="36" cy="56" rx="22" ry="6" fill={TREE_LEAF_LT} />
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
                <rect x="-2.4" y="-18" width="4.8" height="18" rx="1.6" fill={TREE_TRUNK} />
                <circle cx="0" cy="-26" r="11" fill={TREE_LEAF} />
                <circle cx="-6" cy="-22" r="7.5" fill={TREE_LEAF_DK} />
                <circle cx="6" cy="-23" r="7" fill={TREE_LEAF_LT} />
                <circle className="ft-leaf" cx="-8" cy="-30" r="2" fill={TREE_LEAF_LT} />
                <circle className="ft-leaf ft-spark--late" cx="8" cy="-32" r="1.8" fill={TREE_LEAF} />
                <ellipse className="ft-eye" cx="-3" cy="-26" rx="1.4" ry="1.6" fill={TREE_FACE} />
                <ellipse className="ft-eye ft-eye--late" cx="3" cy="-26" rx="1.4" ry="1.6" fill={TREE_FACE} />
              </g>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
