import { describe, expect, it, vi } from "vitest";

import {
  acquireCloudflareRequestPermit,
  getCloudflareRequestGateIntervalMs,
} from "../services/cloudflare-request-gate";

describe("cloudflare request gate", () => {
  it("spaces permits by 250ms", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T02:00:00.000Z"));

    const reservations = [
      String(Date.now() + getCloudflareRequestGateIntervalMs()),
      String(Date.now() + getCloudflareRequestGateIntervalMs() * 2),
    ];

    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => ({
          value: reservations.shift(),
        })),
      })),
    }));

    let secondResolved = false;
    const first = acquireCloudflareRequestPermit({
      DB: { prepare },
    } as never);
    await first;

    const second = acquireCloudflareRequestPermit({
      DB: { prepare },
    } as never).then(() => {
      secondResolved = true;
    });

    await vi.advanceTimersByTimeAsync(249);
    expect(secondResolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(secondResolved).toBe(true);

    vi.useRealTimers();
  });
});
