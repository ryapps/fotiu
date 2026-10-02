import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

config();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || new URL(testDatabaseUrl).pathname.replace(/^\//, "") !== "fotiu_test") {
  throw new Error("E2E tests only run against the isolated fotiu_test database.");
}
if (!process.env.AUTH_SECRET || !process.env.ADMIN_SEED_EMAIL || !process.env.ADMIN_SEED_PASSWORD) {
  throw new Error("E2E tests require AUTH_SECRET and the local admin seed credentials.");
}

const environment = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
  DIRECT_URL: testDatabaseUrl,
  APP_URL: "http://localhost:3100",
  AUTH_TRUST_HOST: "true",
  MIDTRANS_ENVIRONMENT: "sandbox",
  MIDTRANS_SERVER_KEY: "e2e-local-webhook-secret",
};

const root = new URL("../", import.meta.url);
const prismaCli = fileURLToPath(new URL("node_modules/prisma/build/index.js", root));
const nextCli = fileURLToPath(new URL("node_modules/next/dist/bin/next", root));
const seedScript = fileURLToPath(new URL("prisma/seed.ts", root));
const playwrightCli = fileURLToPath(new URL("node_modules/@playwright/test/cli.js", root));

function run(script: string, args: string[]) {
  const result = spawnSync(process.execPath, [script, ...args], {
    env: environment,
    stdio: "inherit",
    cwd: fileURLToPath(root),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(prismaCli, ["migrate", "deploy"]);
run(seedScript, []);
if (process.env.E2E_SKIP_BUILD !== "1") run(nextCli, ["build"]);
run(playwrightCli, ["test"]);
