import {
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { BrandIcon } from "./BrandIcon";
import {
  AccountCartoon,
  LocalShieldCartoon,
  PlatformsCartoon,
} from "./MorphNav";
import { Pip } from "./Pip";
import { buildPlatformGridItems, type GridItem } from "./PlatformGrid";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import platformsData from "../data/platforms.json";
import {
  customPlatformId,
  faviconForHost,
  hostsForPlatforms,
  isCustomPlatformId,
  resolvePlatformFromInput,
} from "../lib/hosts";
import type { AiSiteVerdict } from "../lib/groqClassify";
import {
  DEFAULT_STATE,
  estimateStorageBytes,
  formatStorageSize,
  writeState,
  type PuddleState,
} from "../lib/storage";
import type { Platform } from "../lib/types";

const platforms = platformsData as Platform[];

type SettingsProps = {
  state: PuddleState;
  onStateChange: (next: PuddleState) => void;
  onOpenPlatforms: () => void;
  onGenerateReport: () => void;
};

export function SettingsPane({
  state,
  onStateChange,
  onOpenPlatforms,
  onGenerateReport,
}: SettingsProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(state.userName);
  const bytes = estimateStorageBytes(state);
  const chosen = buildPlatformGridItems(
    platforms,
    state.enabledPlatforms.filter(isCustomPlatformId),
  ).filter((p) => state.enabledPlatforms.includes(p.id));

  const saveName = async () => {
    const userName = nameDraft.trim();
    await writeState({ userName });
    onStateChange({ ...state, userName });
    setEditingName(false);
  };

  const startEditName = () => {
    setNameDraft(state.userName);
    setEditingName(true);
  };

  const clearLocal = async () => {
    const wipe = {
      ...DEFAULT_STATE,
      onboarded: true,
      userName: state.userName,
      enabledPlatforms: state.enabledPlatforms,
    };
    await writeState(wipe);
    onStateChange({ ...state, ...wipe });
  };

  const displayName = state.userName.trim() || "Add your name";

  return (
    <div data-testid="settings-pane" className="flex flex-col gap-2">
      {/* 1. Account / Name card */}
      <section
        data-testid="settings-account-card"
        className="ui-note-enter flex items-center gap-2.5 rounded-xl border border-border bg-white px-2.5 py-2"
        style={{ ["--i" as string]: 0 } as CSSProperties}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "#e7f6ff" }}
        >
          <AccountCartoon size={36} />
        </div>

        {editingName ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Input
              data-testid="settings-name"
              type="text"
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveName();
                } else if (e.key === "Escape") {
                  setEditingName(false);
                }
              }}
              placeholder="Your name"
              className="h-8 rounded-lg border-0 bg-[#f4f4f5] px-2.5 text-sm shadow-none focus-visible:ring-1"
            />
            <button
              type="button"
              data-testid="settings-name-save"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void saveName()}
              className="shrink-0 rounded-full bg-[#1b4965] px-2.5 py-1 text-[11px] font-semibold text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <span
                className="mb-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "#e7f6ff", color: "#2ba4e0" }}
              >
                account
              </span>
              <div
                data-testid="settings-name-display"
                className="truncate text-sm font-semibold text-foreground"
              >
                {displayName}
              </div>
            </div>
            <button
              type="button"
              data-testid="settings-name-edit"
              onClick={startEditName}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f4f4f5] px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-[#eef1f4]"
            >
              <PencilIcon />
              Edit
            </button>
          </>
        )}
      </section>

      {/* 2. AI Platforms card */}
      <button
        type="button"
        data-testid="settings-platforms-row"
        onClick={onOpenPlatforms}
        className="ui-note-enter ui-btn-press flex w-full items-center gap-2.5 rounded-xl border border-border bg-white px-2.5 py-2 text-left transition-colors hover:bg-[#fafafa]"
        style={{ ["--i" as string]: 1 } as CSSProperties}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "#fff8dc" }}
        >
          <PlatformsCartoon size={36} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-1.5">
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
              style={{ background: "#fff8dc", color: "#8a5a00" }}
            >
              {state.enabledPlatforms.length} active
            </span>
            <div className="flex -space-x-1">
              {chosen.slice(0, 4).map((p) => (
                <PlatformAvatar key={p.id} item={p} size={18} />
              ))}
            </div>
          </div>
          <div className="text-xs font-medium text-foreground">
            AI platforms · tap to add or remove
          </div>
        </div>
        <Chevron />
      </button>

      {/* 3. Generate Report card */}
      <button
        type="button"
        data-testid="generate-report-btn"
        onClick={onGenerateReport}
        className="ui-note-enter ui-btn-press flex w-full items-center gap-2.5 rounded-xl border border-border px-2.5 py-2.5 text-left transition-transform"
        style={
          {
            background: "#e8f6df",
            ["--i" as string]: 2,
          } as CSSProperties
        }
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-visible rounded-xl bg-white/85">
          <Pip size={48} variant="sticker" pose="report" tilt={-4} />
        </div>
        <div className="min-w-0 flex-1">
          <span
            className="mb-0.5 inline-flex rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold"
            style={{ color: "#3d8b40" }}
          >
            shareable card
          </span>
          <div className="text-sm font-semibold text-foreground">
            Generate passport report
          </div>
          <div className="text-[11px] text-muted-foreground">
            Muskie presents your score, trees &amp; PDF report
          </div>
        </div>
        <Chevron />
      </button>

      {/* 4. LocalStorage privacy & usage card (placed under Generate Report) */}
      <section
        data-testid="settings-storage"
        className="ui-note-enter flex items-start gap-2.5 rounded-xl border border-border bg-white px-2.5 py-2"
        style={{ ["--i" as string]: 3 } as CSSProperties}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "#e8f6df" }}
        >
          <LocalShieldCartoon size={36} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center justify-between gap-2">
            <span
              className="mb-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
              style={{ background: "#e8f6df", color: "#3d8b40" }}
            >
              {formatStorageSize(bytes)} local
            </span>
            <button
              type="button"
              data-testid="settings-clear"
              className="border-0 bg-transparent p-0 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => void clearLocal()}
            >
              Reset
            </button>
          </div>
          <p className="m-0 text-xs leading-snug text-foreground">
            Saved in LocalStorage on this device ({state.usage.length} prompts).
            Nothing leaves your computer.
          </p>
        </div>
      </section>
    </div>
  );
}

type PlatformsProps = {
  state: PuddleState;
  onStateChange: (next: PuddleState) => void;
  onBack: () => void;
};

export function PlatformsPane({
  state,
  onStateChange,
  onBack,
}: PlatformsProps) {
  const [query, setQuery] = useState("");
  const [barError, setBarError] = useState<string | null>(null);

  const customIds = state.enabledPlatforms.filter(isCustomPlatformId);
  const allItems = useMemo(
    () => buildPlatformGridItems(platforms, customIds),
    [customIds],
  );

  const matchesQuery = (p: GridItem, q: string) => {
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.faviconHost?.toLowerCase().includes(q) ?? false)
    );
  };

  const q = query.trim().toLowerCase();
  const chosen = allItems
    .filter((p) => state.enabledPlatforms.includes(p.id))
    .filter((p) => matchesQuery(p, q));
  const suggested = allItems
    .filter((p) => !state.enabledPlatforms.includes(p.id))
    .filter((p) => matchesQuery(p, q));

  const persist = async (enabledPlatforms: string[]) => {
    await writeState({ enabledPlatforms });
    onStateChange({ ...state, enabledPlatforms });
    try {
      await browser.runtime.sendMessage({
        type: "puddle/coach-rebind",
        enabledPlatforms,
      });
    } catch {
      // background waking
    }
    const origins = hostsForPlatforms(enabledPlatforms, platforms);
    if (origins.length > 0) {
      try {
        await browser.permissions.request({ origins });
      } catch {
        // optional hosts
      }
    }
  };

  const toggle = (id: string) => {
    const next = state.enabledPlatforms.includes(id)
      ? state.enabledPlatforms.filter((x) => x !== id)
      : [...state.enabledPlatforms, id];
    void persist(next);
  };

  const submitBar = (e: FormEvent) => {
    e.preventDefault();
    void (async () => {
      setBarError(null);
      const trimmed = query.trim();
      if (!trimmed) return;
      const resolved = resolvePlatformFromInput(trimmed, platforms);
      if (resolved.ok) {
        if (!state.enabledPlatforms.includes(resolved.id)) {
          await persist([...state.enabledPlatforms, resolved.id]);
        }
        setQuery("");
        return;
      }
      if (resolved.reason === "invalid") {
        setBarError("Only AI platforms");
        return;
      }
      const host = resolved.hostname;
      if (!host) {
        setBarError("Only AI platforms");
        return;
      }
      try {
        const verdict = (await browser.runtime.sendMessage({
          type: "puddle/classify-ai-site",
          hostname: host,
        })) as AiSiteVerdict;
        if (verdict?.isAi) {
          const id = customPlatformId(host);
          if (!state.enabledPlatforms.includes(id)) {
            await persist([...state.enabledPlatforms, id]);
          }
          setQuery("");
          return;
        }
      } catch {
        // fall through
      }
      setBarError("Only AI platforms");
    })();
  };

  return (
    <div
      data-testid="platforms-pane"
      className="flex min-h-0 flex-1 flex-col gap-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-lg font-semibold tracking-tight">
          AI platforms
        </h2>
        <Button
          type="button"
          variant="secondary"
          data-testid="platforms-back"
          className="ui-btn-press ui-btn-press--flip relative h-9 overflow-hidden ps-10 pe-3 text-xs"
          onClick={onBack}
        >
          <span className="ui-btn-chevron pointer-events-none absolute inset-y-0 start-0 flex w-8 items-center justify-center bg-primary-foreground/15">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="rotate-180 opacity-60"
            >
              <path
                d="M6 3 L11 8 L6 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          Back
        </Button>
      </div>

      <form onSubmit={submitBar}>
        <Input
          data-testid="settings-platform-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setBarError(null);
          }}
          placeholder="Search or paste an AI site URL"
          className="h-9 rounded-xl border-0 bg-[#f4f4f5] shadow-none focus-visible:ring-1"
        />
      </form>
      {barError ? (
        <p className="m-0 text-xs text-muted-foreground">{barError}</p>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-0.5 py-0.5">
        <SectionLabel>Chosen ({chosen.length})</SectionLabel>
        {chosen.length === 0 ? (
          <p className="m-0 rounded-xl bg-[#f4f4f5]/60 px-3 py-2 text-xs text-muted-foreground">
            None selected yet. Tap any platform below to add it.
          </p>
        ) : (
          <TileGrid
            items={chosen}
            action="remove"
            onToggle={toggle}
            testPrefix="chosen"
          />
        )}

        <SectionLabel>Suggested ({suggested.length})</SectionLabel>
        {suggested.length === 0 ? (
          <p className="m-0 rounded-xl bg-[#f4f4f5]/60 px-3 py-2 text-xs text-muted-foreground">
            {q
              ? "No matches — paste a URL and press Enter to add a custom AI site."
              : "You're watching every suggested platform."}
          </p>
        ) : (
          <TileGrid
            items={suggested}
            action="add"
            onToggle={toggle}
            testPrefix="suggest"
          />
        )}
      </div>
    </div>
  );
}

function TileGrid({
  items,
  action,
  onToggle,
  testPrefix,
}: {
  items: GridItem[];
  action: "add" | "remove";
  onToggle: (id: string) => void;
  testPrefix: string;
}) {
  return (
    <div
      className="grid w-full gap-2"
      style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
    >
      {items.map((p, idx) => (
        <button
          key={p.id}
          type="button"
          data-testid={`${testPrefix}-${p.id}`}
          onClick={() => onToggle(p.id)}
          style={{ ["--i" as string]: idx } as CSSProperties}
          className={[
            "ui-note-enter ui-btn-press flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-center text-xs transition-colors",
            action === "remove"
              ? "border border-[var(--yale-blue)]/30 bg-[#e7f6ff]"
              : "border border-transparent bg-[#f4f4f5]/80 hover:bg-[#eef1f4]",
          ].join(" ")}
        >
          {p.kind === "custom" && p.faviconHost ? (
            <img
              src={faviconForHost(p.faviconHost)}
              alt=""
              width={32}
              height={32}
              className="rounded-md"
              style={{ width: 32, height: 32, objectFit: "contain" }}
            />
          ) : (
            <BrandIcon slug={p.icon ?? ""} size={32} label={p.name} />
          )}
          <span className="max-w-full truncate font-medium leading-tight">
            {p.name}
          </span>
          <span
            className={[
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              action === "add"
                ? "bg-white/80 text-[#2ba4e0]"
                : "bg-white/80 text-[#1b4965]",
            ].join(" ")}
          >
            {action === "add" ? "+ Add" : "Active"}
          </span>
        </button>
      ))}
    </div>
  );
}

function PlatformAvatar({
  item,
  size = 22,
}: {
  item: GridItem;
  size?: number;
}) {
  if (item.kind === "custom" && item.faviconHost) {
    return (
      <img
        src={faviconForHost(item.faviconHost)}
        alt=""
        width={size}
        height={size}
        className="rounded-full bg-white ring-1 ring-border"
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-white p-0.5"
      style={{ width: size + 6, height: size + 6 }}
    >
      <BrandIcon slug={item.icon ?? ""} size={size - 2} label={item.name} />
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M11.5 2.5 a1.5 1.5 0 0 1 2.1 2.1 L5.2 13 l-3 .8 .8-3 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Chevron() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="shrink-0 opacity-40"
    >
      <path
        d="M6 3 L11 8 L6 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
