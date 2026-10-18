import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), "../.verify7");

type OpenedTab = { url?: string; draft?: string };

async function openedTabs(page: Page): Promise<OpenedTab[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __openedTabs?: OpenedTab[] };
    return w.__openedTabs ?? [];
  });
}

async function assertTopRightToast(page: Page) {
  const overlay = page.getByTestId("coach-overlay");
  await expect(overlay).toBeVisible({ timeout: 5_000 });
  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  const vp = page.viewportSize();
  expect(vp).toBeTruthy();
  if (!box || !vp) return;
  // Top-right: near top edge, in right half
  expect(box.y).toBeLessThan(80);
  expect(box.x + box.width).toBeGreaterThan(vp.width * 0.55);
  // No pet face
  await expect(page.locator('[role="img"]')).toHaveCount(0);
  await expect(page.locator(".pip-svg--talk, .pip-svg--idle")).toHaveCount(0);
}

test.describe("coach redirect uses enabled platforms only", () => {
  test.beforeAll(() => {
    mkdirSync(SHOTS, { recursive: true });
  });

  test("ChatGPT → Gemini when both enabled and no model label", async ({
    page,
  }) => {
    await page.goto(
      "/fixture.html?redirect=1&enabled=chatgpt,gemini",
    );

    await expect(page.getByTestId("fixture-status")).toHaveText(
      /Redirecting to Gemini/i,
      { timeout: 5_000 },
    );
    await assertTopRightToast(page);
    await page.screenshot({
      path: resolve(SHOTS, "playwright-chatgpt-gemini.png"),
      fullPage: true,
    });

    await expect(page.getByTestId("fixture-status")).toHaveText(
      /Opened Gemini/i,
      { timeout: 5_000 },
    );

    const tabs = await openedTabs(page);
    expect(tabs.length).toBeGreaterThanOrEqual(1);
    expect(tabs[0]?.url).toMatch(/gemini\.google\.com/);
    expect(tabs[0]?.url).not.toMatch(/mistral|deepseek/i);
    expect(tabs[0]?.draft).toMatch(/weather/i);

    await page.screenshot({
      path: resolve(SHOTS, "playwright-chatgpt-gemini-opened.png"),
      fullPage: true,
    });
  });

  test("Claude → Perplexity when both enabled and no model label", async ({
    page,
  }) => {
    await page.goto(
      "/fixture.html?redirect=1&provider=claude&enabled=claude,perplexity",
    );

    await expect(page.getByTestId("fixture-status")).toHaveText(
      /Redirecting to Perplexity/i,
      { timeout: 5_000 },
    );
    await assertTopRightToast(page);
    await page.screenshot({
      path: resolve(SHOTS, "playwright-claude-perplexity.png"),
      fullPage: true,
    });

    await expect(page.getByTestId("fixture-status")).toHaveText(
      /Opened Perplexity/i,
      { timeout: 5_000 },
    );

    const tabs = await openedTabs(page);
    expect(tabs.length).toBeGreaterThanOrEqual(1);
    expect(tabs[0]?.url).toMatch(/perplexity\.ai/);
    expect(tabs[0]?.url).not.toMatch(/mistral|deepseek/i);
    expect(tabs[0]?.draft).toMatch(/weather/i);

    await page.screenshot({
      path: resolve(SHOTS, "playwright-claude-perplexity-opened.png"),
      fullPage: true,
    });
  });

  test("only chatgpt enabled → no Mistral invent", async ({ page }) => {
    await page.goto("/fixture.html?redirect=1&enabled=chatgpt");

    await expect(page.getByTestId("fixture-status")).toHaveText(
      /No other enabled platform/i,
      { timeout: 5_000 },
    );

    const tabs = await openedTabs(page);
    expect(tabs).toHaveLength(0);

    await page.screenshot({
      path: resolve(SHOTS, "playwright-chatgpt-only-noop.png"),
      fullPage: true,
    });
  });

  test("deepseek-only alternate skipped", async ({ page }) => {
    await page.goto(
      "/fixture.html?redirect=1&enabled=chatgpt,deepseek",
    );

    await expect(page.getByTestId("fixture-status")).toHaveText(
      /No other enabled platform/i,
      { timeout: 5_000 },
    );

    const tabs = await openedTabs(page);
    expect(tabs).toHaveLength(0);
    for (const t of tabs) {
      expect(t.url ?? "").not.toMatch(/deepseek/i);
    }
  });
});
