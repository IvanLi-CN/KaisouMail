import { describe, expect, it } from "vitest";

import {
  createApiProxy,
  DEFAULT_LOCAL_API_PROXY_TARGET,
  resolveApiProxyTarget,
} from "@/lib/vite-proxy";

describe("web vite config", () => {
  it("normalizes an explicit API proxy target", () => {
    expect(resolveApiProxyTarget("http://127.0.0.1:8788/")).toBe(
      "http://127.0.0.1:8788",
    );
  });

  it("falls back to the local worker when no proxy target is configured", () => {
    expect(resolveApiProxyTarget("   ")).toBe(DEFAULT_LOCAL_API_PROXY_TARGET);
  });

  it("proxies same-origin /api requests in dev and preview", () => {
    const proxy = createApiProxy("http://127.0.0.1:8788");

    expect(proxy["/api"]?.target).toBe("http://127.0.0.1:8788");
    expect(proxy["/api"]?.changeOrigin).toBe(true);
  });
});
