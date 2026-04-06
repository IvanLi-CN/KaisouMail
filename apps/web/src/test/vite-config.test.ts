import { describe, expect, it } from "vitest";

import {
  createWebViteConfig,
  DEFAULT_LOCAL_API_PROXY_TARGET,
  resolveApiProxyTarget,
} from "../../vite.config";

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
    const config = createWebViteConfig({
      port: 4200,
      apiProxyTarget: "http://127.0.0.1:8788",
    });

    const serverProxy = (
      config.server as { proxy: Record<string, { target: string }> }
    ).proxy["/api"];
    const previewProxy = (
      config.preview as { proxy: Record<string, { target: string }> }
    ).proxy["/api"];

    expect(serverProxy.target).toBe("http://127.0.0.1:8788");
    expect(previewProxy.target).toBe("http://127.0.0.1:8788");
  });
});
