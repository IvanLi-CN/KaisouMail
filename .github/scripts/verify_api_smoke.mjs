import { readFileSync } from "node:fs";

const requiredEnv = [
  "HEALTH_CODE",
  "VERSION_CODE",
  "HEALTH_FILE",
  "VERSION_FILE",
  "EXPECTED_SHA",
];

const hasMetaSmoke = "META_CODE" in process.env || "META_FILE" in process.env;

if (hasMetaSmoke) {
  requiredEnv.push("META_CODE", "META_FILE");
}

for (const name of requiredEnv) {
  if (!(name in process.env) || !process.env[name]?.trim()) {
    console.error(`Missing required smoke-check environment variable: ${name}`);
    process.exit(1);
  }
}

const parseExpectedBoolean = (name) => {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return null;
  if (value === "true") return true;
  if (value === "false") return false;

  console.error(
    `Invalid boolean expectation for ${name}: ${process.env[name]}`,
  );
  process.exit(1);
};

const smokeLabel = process.env.SMOKE_LABEL?.trim() || "Smoke";
const healthCode = process.env.HEALTH_CODE;
const versionCode = process.env.VERSION_CODE;
const expectedSha = process.env.EXPECTED_SHA;
const expectedCloudflareLifecycleEnabled = parseExpectedBoolean(
  "EXPECT_CLOUDFLARE_DOMAIN_LIFECYCLE_ENABLED",
);
const expectedCloudflareBindingEnabled = parseExpectedBoolean(
  "EXPECT_CLOUDFLARE_DOMAIN_BINDING_ENABLED",
);

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

if (hasMetaSmoke) {
  const metaCode = process.env.META_CODE;

  if (metaCode !== "200") {
    console.error(`Unexpected status code: /api/meta=${metaCode}`);
    process.exit(1);
  }

  let meta;
  try {
    meta = JSON.parse(readFileSync(process.env.META_FILE, "utf8"));
  } catch (error) {
    console.error(
      `Unable to parse /api/meta payload: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  if (
    expectedCloudflareLifecycleEnabled !== null &&
    meta?.cloudflareDomainLifecycleEnabled !==
      expectedCloudflareLifecycleEnabled
  ) {
    console.error(
      `Expected /api/meta cloudflareDomainLifecycleEnabled=${expectedCloudflareLifecycleEnabled}, received ${JSON.stringify(meta)}`,
    );
    process.exit(1);
  }

  if (
    expectedCloudflareBindingEnabled !== null &&
    meta?.cloudflareDomainBindingEnabled !== expectedCloudflareBindingEnabled
  ) {
    console.error(
      `Expected /api/meta cloudflareDomainBindingEnabled=${expectedCloudflareBindingEnabled}, received ${JSON.stringify(meta)}`,
    );
    process.exit(1);
  }
}

console.log(
  `${smokeLabel} smoke gate passed for deployed commit ${version.commitSha}`,
);
