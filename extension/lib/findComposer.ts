/** Prefer real chat boxes over hidden seed fields. */
export function findComposer(
  root: ParentNode = document,
): HTMLTextAreaElement | HTMLElement | null {
  const prefer = [
    '[data-testid="chat-input"]',
    '[data-testid="prompt-textarea"]',
    'div.ProseMirror[contenteditable="true"]',
    '.ProseMirror[contenteditable="true"]',
    'div[contenteditable="true"][data-placeholder]',
  ];
  for (const sel of prefer) {
    const el = root.querySelector<HTMLElement>(sel);
    if (el && isUsableComposer(el)) return el;
  }

  const textareas = [
    ...root.querySelectorAll<HTMLTextAreaElement>("textarea"),
  ];
  const visibleTa = textareas.find(isUsableComposer);
  if (visibleTa) return visibleTa;

  const editables = [
    ...root.querySelectorAll<HTMLElement>("[contenteditable='true']"),
  ];
  return editables.find(isUsableComposer) ?? null;
}

export function draftFrom(el: HTMLTextAreaElement | HTMLElement): string {
  if (el instanceof HTMLTextAreaElement) return el.value;
  return el.innerText ?? el.textContent ?? "";
}

function isUsableComposer(el: HTMLElement): boolean {
  if (el.getAttribute("aria-hidden") === "true") return false;
  const style = typeof window !== "undefined" ? window.getComputedStyle(el) : null;
  if (style && (style.display === "none" || style.visibility === "hidden")) {
    return false;
  }
  const r = el.getBoundingClientRect();
  // allow zero-size during early mount; reject tiny off-screen seeds when sized
  if (r.width + r.height > 0 && (r.width < 40 || r.height < 16)) return false;
  return true;
}
