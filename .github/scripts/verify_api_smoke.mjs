import { readFileSync } from "node:fs";

const requiredEnv = [
  "HEALTH_CODE",
  "VERSION_CODE",
  "HEALTH_FILE",
  "VERSION_FILE",
  "EXPECTED_SHA",
];

for (const name of requiredEnv) {
  if (!(name in process.env) || !process.env[name]?.trim()) {
    console.error(`Missing required smoke-check environment variable: ${name}`);
    process.exit(1);
  }
}

const smokeLabel = process.env.SMOKE_LABEL?.trim() || "Smoke";
const healthCode = process.env.HEALTH_CODE;
const versionCode = process.env.VERSION_CODE;
const expectedSha = process.env.EXPECTED_SHA;

if (versionCode !== "200") {
  console.error(`Unexpected status code: /api/version=${versionCode}`);
  process.exit(1);
}

let version;
try {
  version = JSON.parse(readFileSync(process.env.VERSION_FILE, "utf8"));
} catch (error) {
  console.error(
    `Unable to parse /api/version payload: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

if (healthCode !== "200") {
  console.error(`Unexpected status code: /health=${healthCode}`);
  process.exit(1);
}

let health;
try {
  health = JSON.parse(readFileSync(process.env.HEALTH_FILE, "utf8"));
} catch (error) {
  console.error(
    `Unable to parse /health payload: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

if (health?.ok !== true) {
  console.error(`Unexpected /health payload: ${JSON.stringify(health)}`);
  process.exit(1);
}

if (version?.commitSha !== expectedSha) {
  console.error(
    `Expected deployed commit ${expectedSha}, received ${version?.commitSha ?? "<missing>"}`,
  );
  process.exit(1);
}

console.log(
  `${smokeLabel} smoke gate passed for deployed commit ${version.commitSha}`,
);
