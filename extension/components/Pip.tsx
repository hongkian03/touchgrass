import type { CSSProperties } from "react";

/** Codex pet atlas: 8 cols × 9 rows (idle = 0, wave = 3). */
const COLS = 8;
const ROWS = 9;
const CELL_W = 192;
const CELL_H = 208;
const SHEET = "/pets/muskie/spritesheet.webp";
/** Ahead-style die-cut sticker (white rim, transparent ground). */
const STICKER = "/pets/muskie/sticker-hello.png";

type Props = {
  size?: number;
  talking?: boolean;
  /** sticker = Ahead floating cutout; sprite = animated sheet */
  variant?: "sticker" | "sprite";
  /** slight sticker tilt in degrees */
  tilt?: number;
  className?: string;
};

/** Pip — Muskie sticker / Codex pet. */
export function Pip({
  size = 140,
  talking = false,
  variant = "sticker",
  tilt = -6,
  className,
}: Props) {
  if (variant === "sticker") {
    return (
      <img
        src={STICKER}
        alt="Pip"
        height={size}
        data-testid="pip"
        data-pip-pet="muskie"
        data-pip-variant="sticker"
        data-talking={talking ? "true" : "false"}
        className={["pip-sticker", className].filter(Boolean).join(" ")}
        style={
          {
            height: size,
            width: "auto",
            objectFit: "contain",
            transform: `rotate(${tilt}deg)`,
            flexShrink: 0,
            userSelect: "none",
            pointerEvents: "none",
          } as CSSProperties
        }
      />
    );
  }

  const scale = size / CELL_H;
  const width = Math.round(CELL_W * scale);
  const height = size;
  const row = talking ? 3 : 0;
  const duration = talking ? "0.7s" : "1.2s";
  const yPct = ROWS === 1 ? 0 : (row / (ROWS - 1)) * 100;

  const style = {
    display: "inline-block",
    width,
    height,
    backgroundImage: `url(${SHEET})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
    backgroundPosition: `0% ${yPct}%`,
    "--pip-y": `${yPct}%`,
    animation: `pip-sprite ${duration} steps(${COLS}) infinite`,
    flexShrink: 0,
  } as CSSProperties;

  return (
    <span
      className={className}
      role="img"
      aria-label="Pip"
      data-testid="pip"
      data-pip-pet="muskie"
      data-pip-variant="sprite"
      data-talking={talking ? "true" : "false"}
      style={style}
    />
  );
}
