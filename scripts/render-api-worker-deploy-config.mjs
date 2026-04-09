import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error(
    "Usage: node scripts/render-api-worker-deploy-config.mjs <input-config> <output-config>",
  );
  process.exit(1);
}

const rawConfig = await readFile(inputPath, "utf8");
const config = JSON.parse(rawConfig);

if (typeof config !== "object" || config === null || Array.isArray(config)) {
  console.error("Expected the Wrangler config to be a JSON object.");
  process.exit(1);
}

const vars =
  typeof config.vars === "object" &&
  config.vars !== null &&
  !Array.isArray(config.vars)
    ? config.vars
    : {};

const emailRoutingManagementEnabled =
  String(vars.EMAIL_ROUTING_MANAGEMENT_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();

if (emailRoutingManagementEnabled && !accountId) {
  console.error(
    "Missing CLOUDFLARE_ACCOUNT_ID. The deploy workflow must inject it into the API Worker runtime config before deploy.",
  );
  process.exit(1);
}

config.vars = {
  ...vars,
  ...(accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {}),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

console.log(outputPath);
