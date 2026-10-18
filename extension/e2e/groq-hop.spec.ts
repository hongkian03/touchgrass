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
  await expect(overlay).toBeVisible({ timeout: 8_000 });
  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  const vp = page.viewportSize();
  expect(vp).toBeTruthy();
  if (!box || !vp) return;
  expect(box.y).toBeLessThan(80);
  expect(box.x + box.width).toBeGreaterThan(vp.width * 0.55);
  await expect(page.locator('[role="img"]')).toHaveCount(0);
  await expect(page.locator(".pip-svg--talk, .pip-svg--idle")).toHaveCount(0);
}

async function typeIntoComposer(page: Page, text: string) {
  const box = page.getByTestId("chat-input");
  await box.click();
  // contenteditable: keyboard so capture-phase input fires
  await page.keyboard.type(text, { delay: 15 });
}

test.describe("Groq hop off Claude-shaped page", () => {
  test.beforeAll(() => {
    mkdirSync(SHOTS, { recursive: true });
  });

  test("weather ask → toast + Gemini tab (not Claude)", async ({ page }) => {
    await page.goto("/hop.html?provider=claude&enabled=claude,gemini");

    await expect(page.getByTestId("hop")).toBeVisible();
    await typeIntoComposer(page, "whats todays weather?");

    // 2s debounce + route
    await assertTopRightToast(page);
    await page.screenshot({
      path: resolve(SHOTS, "playwright-groq-hop-toast.png"),
      fullPage: true,
    });

    await expect
      .poll(async () => (await openedTabs(page)).length, { timeout: 8_000 })
      .toBeGreaterThanOrEqual(1);

    const tabs = await openedTabs(page);
    expect(tabs[0]?.url).toMatch(/gemini\.google\.com/);
    expect(tabs[0]?.url).not.toMatch(/claude\.ai/);
    expect(tabs[0]?.draft).toMatch(/weather/i);

    await page.screenshot({
      path: resolve(SHOTS, "playwright-groq-hop-opened.png"),
      fullPage: true,
    });
  });

  test("routeStay → no new tab when Groq says current site", async ({
    page,
  }) => {
    await page.goto(
      "/hop.html?provider=claude&enabled=claude,gemini&routeStay=1",
    );

    await typeIntoComposer(page, "whats todays weather?");
    // debounce + route + brief settle
    await page.waitForTimeout(2800);

    await expect(page.getByTestId("coach-overlay")).toHaveCount(0);
    const tabs = await openedTabs(page);
    expect(tabs).toHaveLength(0);
  });

  test("remounted contenteditable still hops", async ({ page }) => {
    await page.goto("/hop.html?provider=claude&enabled=claude,gemini");

    // Remount before typing (Claude /new style)
    await page.getByTestId("hop-remount").click();
    await expect(page.getByTestId("chat-input")).toBeVisible();

    const box = page.getByTestId("chat-input");
    await box.click();
    await page.keyboard.type("whats todays weather?", { delay: 15 });

    await assertTopRightToast(page);

    await expect
      .poll(async () => (await openedTabs(page)).length, { timeout: 8_000 })
      .toBeGreaterThanOrEqual(1);

    const tabs = await openedTabs(page);
    expect(tabs[0]?.url).toMatch(/gemini\.google\.com/);
    expect(tabs[0]?.draft).toMatch(/weather/i);

    await page.screenshot({
      path: resolve(SHOTS, "playwright-groq-hop-remount.png"),
      fullPage: true,
    });
  });

  test("Enter immediately hops to Gemini (no 2s wait)", async ({ page }) => {
    await page.goto("/hop.html?provider=claude&enabled=claude,gemini");

    await typeIntoComposer(page, "whats todays weather?");
    // Hit Enter right away — before debounce would fire
    await page.keyboard.press("Enter");

    await assertTopRightToast(page);

    await expect
      .poll(async () => (await openedTabs(page)).length, { timeout: 8_000 })
      .toBeGreaterThanOrEqual(1);

    const tabs = await openedTabs(page);
    expect(tabs[0]?.url).toMatch(/gemini\.google\.com/);
    expect(tabs[0]?.draft).toMatch(/weather/i);
    // Claude send blocked — hop-sent stays 0
    await expect(page.getByTestId("hop-sent")).toHaveText("sent:0");

    await page.screenshot({
      path: resolve(SHOTS, "playwright-groq-hop-enter.png"),
      fullPage: true,
    });
  });

  test("routeStay Enter sends locally, no new tab", async ({ page }) => {
    await page.goto(
      "/hop.html?provider=claude&enabled=claude,gemini&routeStay=1",
    );

    await typeIntoComposer(page, "whats todays weather?");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("hop-sent")).toHaveText("sent:1", {
      timeout: 5_000,
    });
    await expect(page.getByTestId("coach-overlay")).toHaveCount(0);
    const tabs = await openedTabs(page);
    expect(tabs).toHaveLength(0);
  });
});
