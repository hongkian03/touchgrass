import type { Platform } from "../lib/types";

type Props = {
  platforms: Platform[];
  selected: string[];
  onToggle: (id: string) => void;
};

export function PlatformGrid({ platforms, selected, onToggle }: Props) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
    >
      {platforms.map((p) => {
        const on = selected.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            data-testid={`platform-${p.id}`}
            aria-pressed={on}
            onClick={() => onToggle(p.id)}
            className="flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-center"
            style={{
              background: on ? "var(--fresh-sky)" : "var(--frozen-water)",
              color: "var(--yale-blue)",
              border: on
                ? "2px solid var(--yale-blue)"
                : "2px solid transparent",
              fontFamily: "Castoro, serif",
              cursor: "pointer",
            }}
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm"
              style={{
                background: "var(--pale-sky)",
                color: "var(--yale-blue)",
                fontWeight: 600,
              }}
            >
              {p.name.slice(0, 2)}
            </span>
            <span className="text-xs leading-tight">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
