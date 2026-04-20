import { readFileSync, writeFileSync } from "node:fs";

const [command, ...args] = process.argv.slice(2);

const readJsonFile = (path) => JSON.parse(readFileSync(path, "utf8"));

const readJsonEnv = (name, fallback) => {
  const value = process.env[name];
  return JSON.parse(value && value.trim().length > 0 ? value : fallback);
};

const findFirstString = (value, keys) => {
  if (!value || typeof value !== "object") {
    return "";
  }

  for (const key of keys) {
    if (typeof value[key] === "string" && value[key].trim()) {
      return value[key].trim();
    }
  }

  for (const child of Object.values(value)) {
    const nested = findFirstString(child, keys);
    if (nested) {
      return nested;
    }
  }

  return "";
};

switch (command) {
  case "queue-names": {
    const [configPath] = args;
    if (!configPath) {
      console.error("queue-names requires <configPath>");
      process.exit(1);
    }

    const config = readJsonFile(configPath);
    const names = new Set();

    for (const producer of config?.queues?.producers ?? []) {
      if (typeof producer?.queue === "string" && producer.queue.trim()) {
        names.add(producer.queue.trim());
      }
    }

    for (const consumer of config?.queues?.consumers ?? []) {
      if (typeof consumer?.queue === "string" && consumer.queue.trim()) {
        names.add(consumer.queue.trim());
      }
    }

    process.stdout.write([...names].join("\n"));
    break;
  }

  case "queue-exists": {
    const queueName = process.env.TARGET_QUEUE_NAME ?? "";
    const payload = readJsonEnv("EXISTING_QUEUES_JSON", "[]");
    const queues = Array.isArray(payload) ? payload : (payload?.result ?? []);
    const exists = queues.some((queue) => {
      const name =
        typeof queue?.queue_name === "string"
          ? queue.queue_name
          : typeof queue?.queueName === "string"
            ? queue.queueName
            : typeof queue?.name === "string"
              ? queue.name
              : "";
      return name === queueName;
    });

    process.exit(exists ? 0 : 1);
    break;
  }

  case "queue-total-pages": {
    const payload = readJsonEnv("EXISTING_QUEUES_JSON", "{}");
    const totalPages = Number(payload?.result_info?.total_pages);
    process.stdout.write(
      Number.isFinite(totalPages) && totalPages > 0 ? String(totalPages) : "1",
    );
    break;
  }

  case "verify-runtime-config": {
    const [configPath] = args;
    if (!configPath) {
      console.error("verify-runtime-config requires <configPath>");
      process.exit(1);
    }

    const config = readJsonFile(configPath);
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
    const runtimeAccountId =
      typeof config?.vars?.CLOUDFLARE_ACCOUNT_ID === "string"
        ? config.vars.CLOUDFLARE_ACCOUNT_ID.trim()
        : "";
    const managementEnabled =
      String(config?.vars?.EMAIL_ROUTING_MANAGEMENT_ENABLED ?? "")
        .trim()
        .toLowerCase() === "true";

    if (!managementEnabled) {
      console.log(
        "Skipped CLOUDFLARE_ACCOUNT_ID hard requirement because EMAIL_ROUTING_MANAGEMENT_ENABLED=false in the generated API Worker runtime config.",
      );
      process.exit(0);
    }

    if (!accountId) {
      console.error(
        "Missing CLOUDFLARE_ACCOUNT_ID. Set the GitHub secret so deploy can inject the API Worker runtime binding.",
      );
      process.exit(1);
    }

    if (runtimeAccountId !== accountId) {
      console.error(
        `Generated runtime CLOUDFLARE_ACCOUNT_ID mismatch: expected ${accountId}, received ${runtimeAccountId || "<missing>"}`,
      );
      process.exit(1);
    }

    console.log(
      `Verified generated runtime CLOUDFLARE_ACCOUNT_ID=${runtimeAccountId}`,
    );
    break;
  }

  case "extract-undo-bookmark": {
    const payload = readJsonEnv("D1_RESTORE_OUTPUT", "{}");
    const bookmark = findFirstString(payload, [
      "previous_bookmark",
      "previousBookmark",
    ]);

    if (bookmark) {
      process.stdout.write(bookmark);
    }
    break;
  }

  case "verify-required-secrets": {
    const [configPath, runtimeContractEnvFile] = args;
    if (!configPath || !runtimeContractEnvFile) {
      console.error(
        "verify-required-secrets requires <configPath> <runtimeContractEnvFile>",
      );
      process.exit(1);
    }

    const secrets = readJsonEnv("SECRETS_JSON", "[]");
    const names = new Set(secrets.map((secret) => secret.name));
    const wranglerConfig = readJsonFile(configPath);
    const required = Array.isArray(wranglerConfig?.secrets?.required)
      ? wranglerConfig.secrets.required.filter(
          (name) => typeof name === "string" && name.trim().length > 0,
        )
      : [];
    const managementEnabled =
      String(wranglerConfig?.vars?.EMAIL_ROUTING_MANAGEMENT_ENABLED ?? "")
        .trim()
        .toLowerCase() === "true";
    const runtimeAccountId =
      typeof wranglerConfig?.vars?.CLOUDFLARE_ACCOUNT_ID === "string"
        ? wranglerConfig.vars.CLOUDFLARE_ACCOUNT_ID.trim()
        : "";
    const hasRuntimeCloudflareToken =
      names.has("CLOUDFLARE_RUNTIME_API_TOKEN") ||
      names.has("CLOUDFLARE_API_TOKEN") ||
      (typeof wranglerConfig?.vars?.CLOUDFLARE_RUNTIME_API_TOKEN === "string" &&
        wranglerConfig.vars.CLOUDFLARE_RUNTIME_API_TOKEN.trim().length > 0) ||
      (typeof wranglerConfig?.vars?.CLOUDFLARE_API_TOKEN === "string" &&
        wranglerConfig.vars.CLOUDFLARE_API_TOKEN.trim().length > 0);
    const expectedLifecycleEnabled =
      managementEnabled && hasRuntimeCloudflareToken;
    const expectedBindingEnabled =
      expectedLifecycleEnabled && Boolean(runtimeAccountId);

    if (required.length === 0) {
      console.error(
        `${configPath} must declare at least one required runtime secret in secrets.required.`,
      );
      process.exit(1);
    }

    const missing = required.filter((name) => !names.has(name));
    if (missing.length > 0) {
      console.error(
        `Missing required API Worker secrets: ${missing.join(", ")}`,
      );
      console.error(
        "Set them in Cloudflare before deploying, for example with `wrangler secret put <NAME>`.",
      );
      process.exit(1);
    }

    writeFileSync(
      runtimeContractEnvFile,
      `${[
        `API_EXPECTS_CLOUDFLARE_DOMAIN_LIFECYCLE_ENABLED=${expectedLifecycleEnabled}`,
        `API_EXPECTS_CLOUDFLARE_DOMAIN_BINDING_ENABLED=${expectedBindingEnabled}`,
      ].join("\n")}\n`,
    );

    console.log(
      `Verified API Worker secrets: ${required.join(", ")} (hasRuntimeCloudflareToken=${hasRuntimeCloudflareToken})`,
    );
    break;
  }

  case "stable-baseline": {
    const deployments = readJsonEnv("DEPLOYMENTS_JSON", "[]");
    const latest = [...deployments]
      .sort((a, b) => a.created_on.localeCompare(b.created_on))
      .at(-1);

    if (!latest) {
      console.error(
        "Automated deploy requires an existing stable API deployment so the workflow can keep production traffic pinned while it smoke-tests a candidate version.",
      );
      process.exit(1);
    }

    const stable = latest.versions?.find(
      (version) => version.percentage === 100,
    );
    if (!stable?.version_id) {
      console.error(
        "Current API deployment does not expose a single 100% stable version, so the workflow cannot capture the baseline needed for shadow smoke tests.",
      );
      process.exit(1);
    }

    console.log(`version_id=${stable.version_id}`);
    break;
  }

  case "extract-version-upload": {
    const [outputPath, candidateEnvFile] = args;
    if (!outputPath || !candidateEnvFile) {
      console.error(
        "extract-version-upload requires <outputPath> <candidateEnvFile>",
      );
      process.exit(1);
    }

    const lines = readFileSync(outputPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const entry = [...lines]
      .reverse()
      .find((item) => item.type === "version-upload");

    if (!entry?.version_id) {
      console.error(
        "Unable to resolve uploaded Worker version ID from Wrangler output.",
      );
      process.exit(1);
    }

    writeFileSync(candidateEnvFile, `version_id=${entry.version_id}\n`);
    break;
  }

  default:
    console.error(`Unknown command: ${command ?? "<missing>"}`);
    process.exit(1);
}
