import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: ".verify7/playwright-report" }]],
  use: {
    baseURL: "http://127.0.0.1:4177",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "python3 .verify7/serve.py",
    url: "http://127.0.0.1:4177/fixture.html",
    reuseExistingServer: true,
    timeout: 15_000,
  },
  outputDir: ".verify7/playwright-results",
});
