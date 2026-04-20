import type { WorkerEnv } from "../env";
import { nowIso } from "../lib/crypto";

const cloudflareRequestGateKey = "cloudflare_api_next_request_at_ms";
const cloudflareRequestIntervalMs = 250;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const reserveCloudflareRequestSlot = async (env: WorkerEnv) => {
  const nowMs = Date.now();
  const nextAvailableAtMs = nowMs + cloudflareRequestIntervalMs;
  const row = await env.DB.prepare(
    `INSERT INTO runtime_state (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = CASE
        WHEN CAST(runtime_state.value AS INTEGER) > ? THEN CAST(runtime_state.value AS INTEGER) + ?
        ELSE ? + ?
      END,
      updated_at = ?
    RETURNING value`,
  )
    .bind(
      cloudflareRequestGateKey,
      String(nextAvailableAtMs),
      nowIso(),
      nowMs,
      cloudflareRequestIntervalMs,
      nowMs,
      cloudflareRequestIntervalMs,
      nowIso(),
    )
    .first<{ value: string }>();

  const reservedNextAvailableAtMs = Number(row?.value ?? nextAvailableAtMs);
  return Math.max(
    nowMs,
    reservedNextAvailableAtMs - cloudflareRequestIntervalMs,
  );
};

export const acquireCloudflareRequestPermit = async (env: WorkerEnv) => {
  const permitAtMs = await reserveCloudflareRequestSlot(env);
  const waitMs = permitAtMs - Date.now();
  if (waitMs > 0) {
    await sleep(waitMs);
  }
};

export const getCloudflareRequestGateIntervalMs = () =>
  cloudflareRequestIntervalMs;
