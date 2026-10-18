import { INK, InkDefs, ink, paper } from "./FootprintCartoons";

/** Hand-drawn streak flame (ink + paper). Same flicker/lick/pop animation classes. */
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
      <InkDefs />
      <g className="streak-flame__body">
        <path
          d="M24 4 C22 14 10 18 10 30 C10 39 16 44 24 44 C32 44 38 39 38 30 C38 20 30 16 28 8 C27 12 24 14 24 4 Z"
          {...paper}
          strokeWidth={2.6}
        />
        <path
          className="streak-flame__mid"
          d="M24 16 C23 21 17 24 17 31 C17 36 20 40 24 40 C28 40 31 36 31 31 C31 25 27 22 26 17"
          {...ink}
          strokeWidth={2.2}
        />
        <path
          className="streak-flame__inner"
          d="M24 26 C23 29 21 30 21 33 C21 35 22 37 24 37 C26 37 27 35 27 33 C27 30 25 29 24 26 Z"
          fill={INK}
        />
      </g>
      <circle className="streak-spark" cx="10" cy="14" r="1.6" fill={INK} />
      <circle className="streak-spark streak-spark--late" cx="38" cy="16" r="1.4" fill={INK} />
      <circle className="streak-spark streak-spark--mid" cx="34" cy="8" r="1.2" fill={INK} />
    </svg>
  );
}
