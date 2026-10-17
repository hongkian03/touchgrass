import { useEffect, useState } from "react";

type CountUpProps = {
  value: number;
  durationMs?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
  "data-testid"?: string;
};

/** Ease number from 0 → value (score, Wh, L, g). */
export function CountUp({
  value,
  durationMs = 700,
  decimals = 0,
  suffix = "",
  className,
  "data-testid": testId,
}: CountUpProps) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      setShown(from + (value - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  const text =
    decimals > 0
      ? `${shown.toFixed(decimals)}${suffix}`
      : `${Math.round(shown)}${suffix}`;

  return (
    <span data-testid={testId} className={className}>
      {text}
    </span>
  );
}

type ScoreProps = {
  value: number;
  durationMs?: number;
  className?: string;
};

export function ScoreCountUp({
  value,
  durationMs = 700,
  className = "font-sans text-[1.95rem] font-semibold leading-none text-foreground tabular-nums",
}: ScoreProps) {
  const [pop, setPop] = useState(false);

  useEffect(() => {
    setPop(false);
    const t = window.setTimeout(() => setPop(true), durationMs);
    return () => window.clearTimeout(t);
  }, [value, durationMs]);

  return (
    <CountUp
      value={value}
      durationMs={durationMs}
      data-testid="score"
      className={[className, pop ? "ui-score-pop" : ""].filter(Boolean).join(" ")}
    />
  );
}
