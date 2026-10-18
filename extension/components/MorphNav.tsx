import type { ReactNode } from "react";
import { INK, InkDefs, ink, paper } from "./FootprintCartoons";

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

/* Hand-drawn (ink + paper) nav and settings icons. Animation classes unchanged; faces removed. */
export function InsightsIcon({
  size = 20,
  active = false,
}: {
  size?: number;
  active?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" opacity={active ? 1 : 0.6}>
      <InkDefs />
      <path d="M6 18 V13 M12 18 V7 M18 18 V10" {...ink} strokeWidth={2.4} />
      <path d="M4 20 H20" {...ink} strokeWidth={1.8} />
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
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" opacity={active ? 1 : 0.6}>
      <InkDefs />
      <path
        d="M12 3 V5.5 M12 18.5 V21 M3 12 H5.5 M18.5 12 H21 M5.6 5.6 L7.4 7.4 M16.6 16.6 L18.4 18.4 M5.6 18.4 L7.4 16.6 M16.6 7.4 L18.4 5.6"
        {...ink}
        strokeWidth={2.2}
      />
      <circle cx="12" cy="12" r="5.4" {...paper} strokeWidth={2} />
      <circle cx="12" cy="12" r="1.8" fill={INK} />
    </svg>
  );
}

export function AccountCartoon({ size = 40 }: { size?: number }) {
  return (
    <svg className="ft-subtle" width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <InkDefs />
      <path d="M16 58 C16 46 25 42 36 42 C47 42 56 46 56 58" {...paper} />
      <g className="ft-drop">
        <circle cx="36" cy="28" r="12" {...paper} />
      </g>
    </svg>
  );
}

export function LocalShieldCartoon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <InkDefs />
      <g className="ft-cloud">
        <path d="M36 13 L55 20 V35 C55 47 47 55 36 59 C25 55 17 47 17 35 V20 Z" {...paper} />
        <path d="M28 36 L34 42 L45 29" {...ink} />
      </g>
    </svg>
  );
}

export function PlatformsCartoon({ size = 40 }: { size?: number }) {
  return (
    <svg className="ft-subtle" width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <InkDefs />
      <g className="ft-drop">
        <rect x="17" y="17" width="16" height="16" rx="4" {...paper} />
        <rect x="39" y="17" width="16" height="16" rx="4" {...paper} />
        <rect x="17" y="39" width="16" height="16" rx="4" {...paper} />
        <path d="M47 41 V53 M41 47 H53" {...ink} />
      </g>
    </svg>
  );
}
