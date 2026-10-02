import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `"${process.execPath}" node_modules/next/dist/bin/next start --port 3100`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
