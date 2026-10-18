/**
 * Floating Touchgrass panel: a rounded, draggable card on the current page that
 * frames popup.html. Chrome can't round or move the real popup window.
 *
 * `togglePanel` is injected with scripting.executeScript, so it must be fully
 * self-contained (no imports, no outer variables).
 */
export function togglePanel(src: string, width: number, height: number): void {
  const HOST_ID = "touchgrass-panel-host";
  const POS_KEY = "touchgrassPanelPos";
  const BAR = 34;
  const MARGIN = 12;
  /** Bar height when minimized to just the wordmark. */
  const MINI = 48;

  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host {
        /* Same tokens as assets/popup-theme.css */
        --tg-cream: #f8f2e4;
        --tg-line: #dcd2bc;
        --tg-ink: #161616;
        --tg-radius-card: 28px;
        --tg-radius-pill: 999px;
        all: initial;
        position: fixed;
        z-index: 2147483647;
      }
      .card {
        width: ${width}px;
        border-radius: var(--tg-radius-card);
        overflow: hidden;
        background: var(--tg-cream);
        /* Thin edge: the panel's own cream, 80% mixed with black */
        border: 1px solid color-mix(in srgb, var(--tg-cream) 80%, black);
        box-shadow: 0 18px 50px rgba(22, 22, 22, 0.22);
        transform-origin: top left;
        transition: transform 0.18s ease;
      }
      .card.dragging { transition: none; }
      .bar {
        position: relative;
        height: ${BAR}px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        touch-action: none;
        user-select: none;
      }
      .bar.dragging { cursor: grabbing; }
      .grip {
        width: 44px;
        height: 5px;
        border-radius: var(--tg-radius-pill);
        background: var(--tg-ink);
        opacity: 0.32;
        pointer-events: none;
      }
      .controls {
        position: absolute;
        right: 12px;
        top: 4px;
        height: ${BAR}px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      /* Thin −, + and × like a window title bar */
      .ctl {
        width: 24px;
        height: 24px;
        border: 0;
        padding: 0;
        border-radius: var(--tg-radius-pill);
        background: transparent;
        color: var(--tg-ink);
        font: 400 19px/24px system-ui, sans-serif;
        cursor: pointer;
        opacity: 0.6;
      }
      .ctl:hover { opacity: 1; background: rgba(22, 22, 22, 0.07); }
      iframe {
        display: block;
        width: ${width}px;
        height: ${height}px;
        border: 0;
      }
      .card.collapsed iframe { display: none; }
      .ctl:focus { outline: none; }
      .ctl:focus-visible { outline: 2px solid rgba(22, 22, 22, 0.35); }
      /* Minimized: just the wordmark and the controls, centered on one row */
      .label {
        display: none;
        position: absolute;
        left: 20px;
        top: 0;
        bottom: 0;
        align-items: center;
        color: var(--tg-ink);
        font: 400 22px/1 "Touchgrass Dotscript", system-ui, sans-serif;
        pointer-events: none;
      }
      .card.collapsed .bar { height: ${MINI}px; }
      .card.collapsed .label { display: flex; }
      .card.collapsed .grip { display: none; }
      .card.collapsed .controls { top: 0; height: ${MINI}px; right: 14px; }
    </style>
    <div class="card" role="dialog" aria-label="touchgrass">
      <div class="bar" title="Drag to move">
        <div class="grip"></div>
        <div class="label">touchgrass</div>
        <div class="controls">
          <button class="ctl" data-action="minimize" type="button" aria-label="Minimize" title="Minimize">−</button>
          <button class="ctl" data-action="maximize" type="button" aria-label="Maximize" title="Maximize">+</button>
          <button class="ctl" data-action="close" type="button" aria-label="Close" title="Close">×</button>
        </div>
      </div>
      <iframe src="${src}" allow="clipboard-write" title="touchgrass"></iframe>
    </div>`;

  // The wordmark font, from the extension (shadow-root @font-face rules are ignored)
  try {
    const face = new FontFace(
      "Touchgrass Dotscript",
      `url("${new URL("/fonts/DotscriptCursive-Regular.ttf", src).href}")`,
    );
    document.fonts.add(face);
    void face.load().catch(() => undefined);
  } catch {
    // falls back to the system font
  }

  const card = shadow.querySelector<HTMLElement>(".card")!;
  const bar = shadow.querySelector<HTMLElement>(".bar")!;
  const frame = shadow.querySelector<HTMLIFrameElement>("iframe")!;

  /** Height the popup asked for (onboarding is shorter than the stats screens). */
  let wantH = height;
  let collapsed = false;
  let maximized = false;
  /** Where the card sat before maximizing, to return there on restore. */
  let restorePos: { x: number; y: number } | null = null;

  /**
   * Scale for the maximized card: the popup is laid out at a fixed width, so
   * maximize zooms the whole card up to fill the viewport height instead.
   */
  const maxScale = () =>
    Math.max(
      1,
      Math.min(
        (window.innerHeight - 2 * MARGIN) / (wantH + BAR + 2),
        (window.innerWidth - 2 * MARGIN) / (width + 2),
      ),
    );
  const scale = () => (maximized && !collapsed ? maxScale() : 1);

  /** Unscaled card height now: bar only when collapsed, else the frame capped to the viewport. */
  const cardHeight = () => {
    if (collapsed) return MINI + 2;
    const room = window.innerHeight - 2 * MARGIN - BAR - 2;
    const frameH = maximized ? wantH : Math.max(120, Math.min(wantH, room));
    frame.style.height = `${frameH}px`;
    return frameH + BAR + 2;
  };

  // Keep the whole card (all four rounded corners) on screen, MARGIN from each edge
  const clamp = (x: number, y: number) => {
    const s = scale();
    card.style.transform = s === 1 ? "" : `scale(${s})`;
    const h = cardHeight() * s;
    const w = (width + 2) * s;
    return {
      x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
      y: Math.min(Math.max(MARGIN, y), Math.max(MARGIN, window.innerHeight - h - MARGIN)),
    };
  };
  const place = (x: number, y: number) => {
    const p = clamp(x, y);
    host.style.left = `${p.x}px`;
    host.style.top = `${p.y}px`;
    return p;
  };

  // Default: top-right, like the toolbar popup
  let pos = place(window.innerWidth - width - 24, MARGIN + 4);
  try {
    void chrome.storage.local.get(POS_KEY).then((r) => {
      const saved = r?.[POS_KEY] as { x: number; y: number } | undefined;
      if (saved) pos = place(saved.x, saved.y);
    });
  } catch {
    // storage unavailable: keep the default spot
  }

  const setCollapsed = (next: boolean) => {
    collapsed = next;
    card.classList.toggle("collapsed", next);
    pos = place(pos.x, pos.y);
  };

  const maxBtn = shadow.querySelector<HTMLElement>('[data-action="maximize"]')!;
  const setMaximized = (next: boolean) => {
    maximized = next;
    collapsed = false;
    card.classList.remove("collapsed");
    maxBtn.title = next ? "Restore" : "Maximize";
    maxBtn.setAttribute("aria-label", maxBtn.title);
    if (next) {
      restorePos = pos;
      // Centered horizontally, at the top of the viewport
      pos = place((window.innerWidth - (width + 2) * maxScale()) / 2, MARGIN);
    } else {
      pos = place(restorePos?.x ?? pos.x, restorePos?.y ?? pos.y);
      restorePos = null;
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  const onResize = () => {
    pos = place(pos.x, pos.y);
  };
  // The framed popup reports its height when it switches screens
  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow) return;
    const h = (e.data as { type?: string; height?: number } | null) ?? null;
    if (h?.type !== "touchgrass/size" || typeof h.height !== "number") return;
    wantH = h.height;
    pos = place(pos.x, pos.y);
  };
  function close() {
    host.remove();
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("message", onMessage);
    window.removeEventListener("mousemove", onMouseMove, true);
    window.removeEventListener("mouseup", end, true);
  }

  shadow.querySelector(".controls")!.addEventListener("click", (e) => {
    const action = (e.target as Element).closest<HTMLElement>("[data-action]")?.dataset.action;
    // − and + step one size at a time: maximized ↔ normal ↔ minimized
    if (action === "minimize") {
      if (maximized) setMaximized(false);
      else setCollapsed(true);
    } else if (action === "maximize") {
      if (collapsed) setCollapsed(false);
      else if (!maximized) setMaximized(true);
    } else if (action === "close") close();
  });
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", onResize);
  window.addEventListener("message", onMessage);

  // Drag by the top bar. Window-level move/up listeners keep it working even if
  // the pointer leaves the bar; mouse events back up pages that eat pointer events.
  let drag: { dx: number; dy: number } | null = null;
  const start = (x: number, y: number, target: EventTarget | null) => {
    if ((target as Element | null)?.closest?.(".controls")) return false;
    drag = { dx: x - pos.x, dy: y - pos.y };
    bar.classList.add("dragging");
    card.classList.add("dragging");
    frame.style.pointerEvents = "none";
    return true;
  };
  const move = (x: number, y: number) => {
    if (drag) pos = place(x - drag.dx, y - drag.dy);
  };
  function onMouseMove(e: MouseEvent) {
    move(e.clientX, e.clientY);
  }
  function end() {
    if (!drag) return;
    drag = null;
    bar.classList.remove("dragging");
    card.classList.remove("dragging");
    frame.style.pointerEvents = "";
    // Only the normal-size spot is remembered
    if (maximized) return;
    try {
      void chrome.storage.local.set({ [POS_KEY]: pos });
    } catch {
      // position just won't persist
    }
  }
  bar.addEventListener("pointerdown", (e) => {
    if (start(e.clientX, e.clientY, e.target)) {
      e.preventDefault();
      bar.setPointerCapture(e.pointerId);
    }
  });
  bar.addEventListener("pointermove", (e) => move(e.clientX, e.clientY));
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", end);
  bar.addEventListener("mousedown", (e) => {
    if (!drag) start(e.clientX, e.clientY, e.target);
  });
  window.addEventListener("mousemove", onMouseMove, true);
  window.addEventListener("mouseup", end, true);

  document.documentElement.appendChild(host);
}
