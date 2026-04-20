import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

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

const readConfig = (configPath, commandName) => {
  if (!configPath) {
    console.error(`${commandName} requires <configPath>`);
    process.exit(1);
  }

  return readJsonFile(configPath);
};

const toOptionalString = (value) => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
};

const appendStepSummary = (heading, lines) => {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY?.trim() ?? "";
  if (!summaryPath || lines.length === 0) {
    return;
  }

  appendFileSync(
    summaryPath,
    `## ${heading}\n\n${lines.map((line) => `- ${line}`).join("\n")}\n`,
    "utf8",
  );
};

const syncQueueConsumersIfConfigured = (configPath, config) => {
  const consumers = Array.isArray(config?.queues?.consumers)
    ? config.queues.consumers.filter(
        (consumer) =>
          typeof consumer?.queue === "string" && consumer.queue.trim().length > 0,
      )
    : [];

  if (consumers.length === 0) {
    return [];
  }

  const scriptName = toOptionalString(config?.name);
  if (!scriptName) {
    throw new Error(
      `${configPath} must declare Worker name before queue consumer sync can run.`,
    );
  }

  const wranglerBin = process.env.WRANGLER_BIN?.trim() ?? "";
  const deployToken =
    process.env.CF_MAIL_DEPLOY_API_TOKEN?.trim() ??
    process.env.CLOUDFLARE_API_TOKEN?.trim() ??
    "";

  const missingEnv = [
    !wranglerBin ? "WRANGLER_BIN" : "",
    !deployToken ? "CF_MAIL_DEPLOY_API_TOKEN/CLOUDFLARE_API_TOKEN" : "",
  ].filter(Boolean);

  if (missingEnv.length > 0) {
    throw new Error(
      `Queue consumer sync requires ${missingEnv.join(", ")} when queues.consumers is declared in ${configPath}.`,
    );
  }

  const wranglerEnv = {
    ...process.env,
    CLOUDFLARE_API_TOKEN: deployToken,
  };

  const summaryLines = [];

  for (const consumer of consumers) {
    const queueName = consumer.queue.trim();
    const batchSize = toOptionalString(consumer.max_batch_size);
    const batchTimeout = toOptionalString(consumer.max_batch_timeout);
    const maxConcurrency = toOptionalString(consumer.max_concurrency);
    const retryDelay = toOptionalString(consumer.retry_delay);
    const messageRetries = toOptionalString(consumer.max_retries);
    const deadLetterQueue = toOptionalString(consumer.dead_letter_queue);

    const removeArgs = [
      "queues",
      "consumer",
      "worker",
      "remove",
      queueName,
      scriptName,
      "--config",
      configPath,
    ];

    try {
      execFileSync(wranglerBin, removeArgs, {
        encoding: "utf8",
        env: wranglerEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const stderr =
        typeof error?.stderr === "string"
          ? error.stderr
          : Buffer.isBuffer(error?.stderr)
            ? error.stderr.toString("utf8")
            : "";
      const stdout =
        typeof error?.stdout === "string"
          ? error.stdout
          : Buffer.isBuffer(error?.stdout)
            ? error.stdout.toString("utf8")
            : "";
      const combinedOutput = `${stdout}\n${stderr}`;

      if (!/not found|does not exist|no consumer|not configured/i.test(combinedOutput)) {
        throw new Error(
          `Failed to remove existing queue consumer ${queueName}/${scriptName} before sync.\n${combinedOutput.trim()}`,
        );
      }
    }

    const addArgs = [
      "queues",
      "consumer",
      "worker",
      "add",
      queueName,
      scriptName,
      "--config",
      configPath,
    ];

    if (batchSize) {
      addArgs.push("--batch-size", batchSize);
    }
    if (batchTimeout) {
      addArgs.push("--batch-timeout", batchTimeout);
    }
    if (maxConcurrency) {
      addArgs.push("--max-concurrency", maxConcurrency);
    }
    if (retryDelay) {
      addArgs.push("--retry-delay-secs", retryDelay);
    }
    if (messageRetries) {
      addArgs.push("--message-retries", messageRetries);
    }
    if (deadLetterQueue) {
      addArgs.push("--dead-letter-queue", deadLetterQueue);
    }

    execFileSync(wranglerBin, addArgs, {
      encoding: "utf8",
      env: wranglerEnv,
      stdio: ["ignore", "inherit", "inherit"],
    });

    summaryLines.push(
      `${queueName} -> ${scriptName} (batch_size=${batchSize || "<default>"}, batch_timeout=${batchTimeout || "<default>"}, max_concurrency=${maxConcurrency || "<default>"}, retry_delay=${retryDelay || "<default>"}, message_retries=${messageRetries || "<default>"}, dead_letter_queue=${deadLetterQueue || "<none>"})`,
    );
  }

  appendStepSummary("API queue consumer sync", summaryLines);
  return summaryLines;
};

switch (command) {
  case "queue-names": {
    const [configPath] = args;
    const config = readConfig(configPath, "queue-names");
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

  case "queue-consumer-script-name": {
    const [configPath] = args;
    const config = readConfig(configPath, "queue-consumer-script-name");
    const scriptName =
      typeof config?.name === "string" ? config.name.trim() : "";

    if (!scriptName) {
      console.error(
        `${configPath} must declare Worker name before queue consumer sync can run.`,
      );
      process.exit(1);
    }

    process.stdout.write(scriptName);
    break;
  }

  case "queue-consumer-lines": {
    const [configPath] = args;
    const config = readConfig(configPath, "queue-consumer-lines");
    const consumers = Array.isArray(config?.queues?.consumers)
      ? config.queues.consumers
      : [];

    const lines = consumers
      .filter(
        (consumer) =>
          typeof consumer?.queue === "string" && consumer.queue.trim().length > 0,
      )
      .map((consumer) =>
        [
          consumer.queue.trim(),
          toOptionalString(consumer.max_batch_size),
          toOptionalString(consumer.max_batch_timeout),
          toOptionalString(consumer.max_concurrency),
          toOptionalString(consumer.retry_delay),
          toOptionalString(consumer.max_retries),
          toOptionalString(consumer.dead_letter_queue),
        ].join("\t"),
      );

    process.stdout.write(lines.join("\n"));
    break;
  }

  case "queue-exists": {
    const queueName = process.env.TARGET_QUEUE_NAME ?? "";
    const payload = readJsonEnv("EXISTING_QUEUES_JSON", "[]");
    const queues = Array.isArray(payload) ? payload : payload?.result ?? [];
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
    const config = readConfig(configPath, "verify-runtime-config");
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
    const runtimeAccountId =
      typeof config?.vars?.CLOUDFLARE_ACCOUNT_ID === "string"
        ? config.vars.CLOUDFLARE_ACCOUNT_ID.trim()
        : "";
    const managementEnabled =
      String(config?.vars?.EMAIL_ROUTING_MANAGEMENT_ENABLED ?? "")
        .trim()
        .toLowerCase() === "true";

    const consumerSummaryLines = syncQueueConsumersIfConfigured(configPath, config);
    if (consumerSummaryLines.length > 0) {
      console.log(
        `Synced API Worker queue consumers: ${consumerSummaryLines.join("; ")}`,
      );
    }

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
      console.error(`Missing required API Worker secrets: ${missing.join(", ")}`);
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
