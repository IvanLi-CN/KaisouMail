import { afterEach, describe, expect, it, vi } from "vitest";

const { browserSupportsWebAuthn } = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(),
}));

vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn,
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));

import {
  browserSupportsPasskeys,
  resolvePasskeySupportState,
} from "@/lib/passkeys";

const originalLocation = globalThis.location;

describe("browserSupportsPasskeys", () => {
  afterEach(() => {
    browserSupportsWebAuthn.mockReset();
    vi.unstubAllGlobals();
    vi.stubGlobal("location", originalLocation);
  });

  it("disables passkeys on IPv4 literal hosts even when WebAuthn is available", () => {
    browserSupportsWebAuthn.mockReturnValue(true);
    vi.stubGlobal("location", new URL("http://127.0.0.1:4173/login"));

    expect(browserSupportsPasskeys()).toBe(false);
    expect(browserSupportsWebAuthn).not.toHaveBeenCalled();
  });

  it("keeps passkeys enabled on localhost when WebAuthn is available", () => {
    browserSupportsWebAuthn.mockReturnValue(true);
    vi.stubGlobal("location", new URL("http://localhost:4173/login"));

    expect(browserSupportsPasskeys()).toBe(true);
    expect(browserSupportsWebAuthn).toHaveBeenCalledTimes(1);
  });
});

describe("resolvePasskeySupportState", () => {
  it("disables passkeys when the backend is not configured", () => {
    expect(
      resolvePasskeySupportState({
        browserSupported: true,
        currentOrigin: "https://cfm.707979.xyz",
        passkeyAuthEnabled: false,
      }),
    ).toMatchObject({
      backendConfigured: false,
      buttonLabel: "当前环境未启用 Passkey",
      supported: false,
    });
  });

  it("prefers browser support messaging when WebAuthn is unavailable", () => {
    expect(
      resolvePasskeySupportState({
        browserSupported: false,
        currentOrigin: "https://cfm.707979.xyz",
        passkeyAuthEnabled: true,
      }),
    ).toMatchObject({
      backendConfigured: true,
      buttonLabel: "当前浏览器不支持 Passkey",
      supported: false,
    });
  });

  it("disables passkeys when the current origin is not trusted", () => {
    expect(
      resolvePasskeySupportState({
        apiOrigin: "https://api.cfm.707979.xyz",
        browserSupported: true,
        currentOrigin: "https://preview.707979.xyz",
        passkeyAuthEnabled: true,
        passkeyTrustedOrigins: ["https://cfm.707979.xyz"],
      }),
    ).toMatchObject({
      backendConfigured: true,
      buttonLabel: "当前域名未启用 Passkey",
      supported: false,
    });
  });

  it("keeps passkeys enabled when the current origin is trusted", () => {
    expect(
      resolvePasskeySupportState({
        apiOrigin: "https://api.cfm.707979.xyz",
        browserSupported: true,
        currentOrigin: "https://cfm.707979.xyz",
        passkeyAuthEnabled: true,
        passkeyTrustedOrigins: ["https://cfm.707979.xyz"],
      }),
    ).toMatchObject({
      backendConfigured: true,
      buttonLabel: "使用 Passkey 登录",
      supported: true,
    });
  });

  it("disables passkeys when the API base is cross-site", () => {
    expect(
      resolvePasskeySupportState({
        apiOrigin: "http://127.0.0.1:8787",
        browserSupported: true,
        currentOrigin: "http://localhost:4173",
        passkeyAuthEnabled: true,
        passkeyTrustedOrigins: ["http://localhost:4173"],
      }),
    ).toMatchObject({
      backendConfigured: true,
      buttonLabel: "当前环境不支持 Passkey",
      supported: false,
    });
  });

  it("keeps demo/local preview origins eligible when explicitly allowed", () => {
    expect(
      resolvePasskeySupportState({
        allowAnyLocalOrigin: true,
        apiOrigin: "http://localhost:8787",
        browserSupported: true,
        currentOrigin: "http://localhost:4173",
        passkeyAuthEnabled: true,
        passkeyTrustedOrigins: ["https://cfm.707979.xyz"],
      }),
    ).toMatchObject({
      backendConfigured: true,
      buttonLabel: "使用 Passkey 登录",
      supported: true,
    });
  });
});
