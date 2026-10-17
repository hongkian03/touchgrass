import {
  faviconForHost,
  hostnameFromCustomId,
  isCustomPlatformId,
} from "../lib/hosts";
import type { Platform } from "../lib/types";
import { cn } from "../lib/utils";
import { BrandIcon } from "./BrandIcon";

export type GridItem = {
  id: string;
  name: string;
  kind: "known" | "custom";
  icon?: string;
  faviconHost?: string;
};

/** Merge seed platforms + custom:host ids into one grid list. */
export function buildPlatformGridItems(
  platforms: Platform[],
  customIds: string[],
): GridItem[] {
  const known: GridItem[] = platforms.map((p) => ({
    id: p.id,
    name: p.name,
    kind: "known",
    icon: p.icon,
  }));
  const customs: GridItem[] = customIds.filter(isCustomPlatformId).map((id) => {
    const host = hostnameFromCustomId(id) ?? id.replace(/^custom:/, "");
    return {
      id,
      name: host,
      kind: "custom" as const,
      faviconHost: host,
    };
  });
  return [...known, ...customs];
}

type Props = {
  platforms: Platform[];
  selected: string[];
  onToggle: (id: string) => void;
  query?: string;
  customIds?: string[];
};

export function PlatformGrid({
  platforms,
  selected,
  onToggle,
  query = "",
  customIds = [],
}: Props) {
  const q = query.trim().toLowerCase();
  const items = buildPlatformGridItems(platforms, customIds);
  const visible = q
    ? items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.faviconHost?.toLowerCase().includes(q) ?? false),
      )
    : items;

  return (
    <div
      className="grid w-full gap-2"
      style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
    >
      {visible.map((p) => {
        const on = selected.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            data-testid={`platform-${p.id}`}
            aria-pressed={on}
            onClick={() => onToggle(p.id)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg bg-transparent px-2 py-2 text-center font-sans text-foreground outline-none border",
              on ? "border-black" : "border-transparent",
            )}
          >
            {p.kind === "custom" && p.faviconHost ? (
              <img
                src={faviconForHost(p.faviconHost)}
                alt=""
                width={36}
                height={36}
                className="rounded-md"
                style={{ width: 36, height: 36, objectFit: "contain" }}
              />
            ) : (
              <BrandIcon slug={p.icon ?? ""} size={36} label={p.name} />
            )}
            <span className="max-w-full truncate text-xs leading-tight">
              {p.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
