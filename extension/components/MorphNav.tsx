import type { ReactNode } from "react";

export type MorphTab = "insights" | "settings";

type Props = {
  active: MorphTab;
  onChange: (tab: MorphTab) => void;
};

export function MorphNav({ active, onChange }: Props) {
  return (
    <div
      data-testid="morph-nav"
      className="inline-flex items-center gap-1.5 rounded-full bg-[#f4f4f5] p-1"
      role="tablist"
      aria-label="Insights and Settings"
    >
      <MorphPill
        testId="morph-insights"
        active={active === "insights"}
        label="Insights"
        icon={<InsightsIcon size={20} active={active === "insights"} />}
        onClick={() => onChange("insights")}
      />
      <MorphPill
        testId="morph-settings"
        active={active === "settings"}
        label="Settings"
        icon={<GearIcon size={20} active={active === "settings"} />}
        onClick={() => onChange("settings")}
      />
    </div>
  );
}

function MorphPill({
  active,
  label,
  icon,
  onClick,
  testId,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testId}
      data-expanded={active ? "true" : "false"}
      onClick={onClick}
      className={[
        "ui-morph-pill inline-flex h-8 items-center justify-center rounded-full font-sans text-sm font-semibold outline-none",
        active
          ? "gap-1.5 bg-white px-3 text-foreground shadow-sm"
          : "w-8 px-0 text-muted-foreground hover:bg-white/60 hover:text-foreground",
      ].join(" ")}
    >
      <span className="flex shrink-0 items-center justify-center">{icon}</span>
      <span
        className={[
          "overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)]",
          active ? "max-w-[96px] opacity-100" : "max-w-0 opacity-0",
        ].join(" ")}
      >
        {label}
      </span>
    </button>
  );
}

export function InsightsIcon({
  size = 20,
  active = false,
}: {
  size?: number;
  active?: boolean;
}) {
  const bg = active ? "#e8f6df" : "#eef1f4";
  const bar1 = active ? "#8fd18f" : "#94a3b8";
  const bar2 = active ? "#5cb85c" : "#64748b";
  const bar3 = active ? "#3d8b40" : "#475569";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill={bg} />
      <rect x="6" y="12" width="3.2" height="6" rx="1.5" fill={bar1} />
      <rect x="10.4" y="7" width="3.2" height="11" rx="1.5" fill={bar2} />
      <rect x="14.8" y="9.5" width="3.2" height="8.5" rx="1.5" fill={bar3} />
    </svg>
  );
}

export function GearIcon({
  size = 20,
  active = false,
}: {
  size?: number;
  active?: boolean;
}) {
  const bg = active ? "#e7f6ff" : "#eef1f4";
  const body = active ? "#2ba4e0" : "#64748b";
  const center = active ? "#ffffff" : "#f4f4f5";
  const rim = active ? "#0b4f74" : "#475569";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill={bg} />
      <g transform="translate(12 12)">
        {/* 8 symmetrical rounded gear teeth */}
        <rect x="-1.6" y="-8.2" width="3.2" height="16.4" rx="1.4" fill={body} />
        <rect
          x="-1.6"
          y="-8.2"
          width="3.2"
          height="16.4"
          rx="1.4"
          fill={body}
          transform="rotate(45)"
        />
        <rect
          x="-1.6"
          y="-8.2"
          width="3.2"
          height="16.4"
          rx="1.4"
          fill={body}
          transform="rotate(90)"
        />
        <rect
          x="-1.6"
          y="-8.2"
          width="3.2"
          height="16.4"
          rx="1.4"
          fill={body}
          transform="rotate(135)"
        />
        <circle cx="0" cy="0" r="5.8" fill={body} />
        <circle
          cx="0"
          cy="0"
          r="2.6"
          fill={center}
          stroke={rim}
          strokeWidth="1.2"
        />
      </g>
    </svg>
  );
}

/** Cute pastel cartoon account avatar matching FootprintCartoons / CoachNoteCard icons. */
export function AccountCartoon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="#d6f0ff" />
      {/* Shoulders */}
      <path
        d="M16 58 C16 46 25 42 36 42 C47 42 56 46 56 58"
        fill="#2ba4e0"
      />
      {/* Head with gentle bounce */}
      <g className="ft-drop">
        <circle cx="36" cy="29" r="13" fill="#5fa8d3" />
        <ellipse cx="32" cy="25" rx="4" ry="3" fill="#bee9e8" opacity="0.85" />
        <circle className="ft-eye" cx="31.5" cy="29" r="1.9" fill="#0b4f74" />
        <circle
          className="ft-eye ft-eye--late"
          cx="40.5"
          cy="29"
          r="1.9"
          fill="#0b4f74"
        />
        <path
          d="M32 34 Q36 37.5 40 34"
          fill="none"
          stroke="#0b4f74"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** Cute pastel cartoon local-storage shield matching FootprintCartoons. */
export function LocalShieldCartoon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="#d8f0c8" />
      <g className="ft-cloud">
        <path
          d="M36 14 L54 21 V35 C54 47 46 55 36 59 C26 55 18 47 18 35 V21 Z"
          fill="#5cb85c"
          stroke="#2d5a27"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M36 18 L49 23.5 V34.5 C49 44 43 50.5 36 54"
          fill="#8fd18f"
          opacity="0.55"
        />
        <circle className="ft-eye" cx="31" cy="34" r="1.9" fill="#2d5a27" />
        <circle
          className="ft-eye ft-eye--late"
          cx="41"
          cy="34"
          r="1.9"
          fill="#2d5a27"
        />
        <path
          d="M31.5 40 Q36 43.5 40.5 40"
          fill="none"
          stroke="#2d5a27"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** Cute pastel cartoon AI platforms icon matching AccountCartoon / LocalShieldCartoon. */
export function PlatformsCartoon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="#fff3c4" />
      <g className="ft-drop">
        {/* 4-tile mini app grid */}
        <rect
          x="18"
          y="18"
          width="15"
          height="15"
          rx="4.5"
          fill="#f5c400"
          stroke="#8a5a00"
          strokeWidth="1.5"
        />
        <rect
          x="39"
          y="18"
          width="15"
          height="15"
          rx="4.5"
          fill="#2ba4e0"
          stroke="#0b4f74"
          strokeWidth="1.5"
        />
        <rect
          x="18"
          y="39"
          width="15"
          height="15"
          rx="4.5"
          fill="#5cb85c"
          stroke="#2d5a27"
          strokeWidth="1.5"
        />
        <rect
          x="39"
          y="39"
          width="15"
          height="15"
          rx="4.5"
          fill="#ffffff"
          stroke="#8a5a00"
          strokeWidth="1.5"
        />
        {/* Cute sparkle in the 4th tile */}
        <path
          d="M46.5 42.5 L48 45.5 L51 46.5 L48 47.5 L46.5 50.5 L45 47.5 L42 46.5 L45 45.5 Z"
          fill="#f5c400"
        />
      </g>
    </svg>
  );
}
