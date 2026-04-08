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
        passkeyAuthEnabled: true,
      }),
    ).toMatchObject({
      backendConfigured: true,
      buttonLabel: "当前浏览器不支持 Passkey",
      supported: false,
    });
  });
});
