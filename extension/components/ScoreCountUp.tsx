import { useEffect, useState } from "react";

type Props = {
  value: number;
  durationMs?: number;
};

export function ScoreCountUp({ value, durationMs = 700 }: Props) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return (
    <span
      data-testid="score"
      style={{
        fontFamily: "Castoro, serif",
        fontVariantNumeric: "tabular-nums",
        fontSize: "3.25rem",
        lineHeight: 1,
        color: "var(--yale-blue)",
      }}
    >
      {shown}
    </span>
  );
}
