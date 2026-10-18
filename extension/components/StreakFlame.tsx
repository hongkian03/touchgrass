/** Duo-style streak flame — orange flicker, not Pip tokens. */
const OUTER = "#ff6a00";
const MID = "#ff9600";
const INNER = "#ffd000";
const CORE = "#fff3b0";

type Props = {
  size?: number;
};

export function StreakFlame({ size = 36 }: Props) {
  return (
    <svg
      data-testid="streak-flame"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="streak-flame"
    >
      <g className="streak-flame__body">
        <path
          d="M24 4 C22 14 10 18 10 30 C10 39 16 44 24 44 C32 44 38 39 38 30 C38 20 30 16 28 8 C27 12 24 14 24 4 Z"
          fill={OUTER}
        />
        <path
          className="streak-flame__mid"
          d="M24 12 C23 18 16 21 16 30 C16 36 19 40 24 40 C29 40 32 36 32 30 C32 23 27 20 26 14 Z"
          fill={MID}
        />
        <path
          className="streak-flame__inner"
          d="M24 22 C23 26 20 28 20 32 C20 35 22 37 24 37 C26 37 28 35 28 32 C28 28 25 27 24 22 Z"
          fill={INNER}
        />
        <ellipse cx="22" cy="33" rx="3" ry="4" fill={CORE} opacity="0.85" />
      </g>
      <circle className="streak-spark" cx="10" cy="14" r="1.6" fill={INNER} />
      <circle className="streak-spark streak-spark--late" cx="38" cy="16" r="1.4" fill={MID} />
      <circle className="streak-spark streak-spark--mid" cx="34" cy="8" r="1.2" fill={OUTER} />
    </svg>
  );
}
