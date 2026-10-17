/** Popup/dashboard → background PromptPrint calls (no direct fetch). */

export async function bgBackend<T = unknown>(
  op: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const result = (await browser.runtime.sendMessage({
    type: "touchgrass/backend",
    op,
    ...payload,
  })) as T & { ok?: boolean; error?: string };
  return result;
}
