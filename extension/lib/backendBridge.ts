/** Popup/dashboard → background PromptPrint calls (no direct fetch). */

import {
  isExtensionContextAlive,
  isExtensionContextError,
} from "./storage";

export async function bgBackend<T = unknown>(
  op: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  try {
    if (!isExtensionContextAlive()) {
      return { ok: false, error: "extension_context_invalidated" } as T;
    }
    const result = (await browser.runtime.sendMessage({
      type: "touchgrass/backend",
      op,
      ...payload,
    })) as T & { ok?: boolean; error?: string };
    return result;
  } catch (e) {
    if (isExtensionContextError(e)) {
      return { ok: false, error: "extension_context_invalidated" } as T;
    }
    throw e;
  }
}
