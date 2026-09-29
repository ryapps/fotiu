import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

config();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required. Use the isolated fotiu_test database.",
  );
}

const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");

if (databaseName !== "fotiu_test") {
  throw new Error(
    "Integration tests only run against the isolated fotiu_test database.",
  );
}

const environment = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
  DIRECT_URL: testDatabaseUrl,
};

function run(scriptPath: string, args: string[]) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    env: environment,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
const vitestCli = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
);

run(prismaCli, ["migrate", "deploy"]);
run(vitestCli, ["run", "--config", "vitest.integration.config.ts"]);
