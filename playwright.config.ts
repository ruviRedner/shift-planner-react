import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: [{
    command: "node server/index.mjs",
    url: "http://127.0.0.1:3081/api/status", reuseExistingServer: false,
    env: { PORT: "3081", PLANNER_SETUP_TOKEN: "playwright-setup-code", PLANNER_DATA_FILE: `test-results/team-${Date.now()}.json` },
  }, {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173", reuseExistingServer: false,
    env: { PLANNER_API_TARGET: "http://127.0.0.1:3081" },
  }],
});
