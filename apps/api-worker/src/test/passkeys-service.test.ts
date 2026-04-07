import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../env";

const {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} = vi.hoisted(() => ({
  generateAuthenticationOptions: vi.fn(),
  generateRegistrationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
}));

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
}));

vi.mock("../db/client", () => ({
  getDb,
}));

import {
  verifyPasskeyAuthentication,
  verifyPasskeyRegistrationForUser,
} from "../services/passkeys";

const baseConfig = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
  EMAIL_ROUTING_MANAGEMENT_ENABLED: false,
  BOOTSTRAP_ADMIN_NAME: "Owner",
  SESSION_SECRET: "super-secret-session-key",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
  WEB_APP_ORIGIN: "https://cfm.707979.xyz",
} satisfies RuntimeConfig;

const authUser = {
  id: "usr_owner",
  email: "owner@example.com",
  name: "Owner",
  role: "admin",
} as const;

const createCookieRequest = (cookie: string) =>
  new Request("https://api.example.test", {
    headers: {
      cookie,
    },
  });

const createAwaitableQuery = <T>(rows: T[]) => ({
  limit: async (count: number) => rows.slice(0, count),
});

describe("passkey service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists a verified registration", async () => {
    const inserted: unknown[] = [];
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: "credential_123",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ["internal"],
        },
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
      },
    });
    getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => createAwaitableQuery([]),
        }),
      }),
      insert: () => ({
        values: async (row: unknown) => {
          inserted.push(row);
        },
      }),
    });

    const registrationCookie =
      "kaisoumail_passkey_registration=" +
      encodeURIComponent(
        await (await import("../lib/crypto")).signPayload(
          {
            kind: "registration",
            challenge: "registration_challenge",
            name: "MacBook Pro",
            userId: authUser.id,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300,
          },
          baseConfig.SESSION_SECRET,
        ),
      );

    const result = await verifyPasskeyRegistrationForUser(
      {} as never,
      baseConfig,
      createCookieRequest(registrationCookie),
      authUser,
      {
        id: "credential_123",
        rawId: "credential_123",
        response: {
          attestationObject: "attestation",
          clientDataJSON: "client-data",
          transports: ["internal"],
        },
        clientExtensionResults: {},
        type: "public-key",
      } as RegistrationResponseJSON,
    );

    expect(result.passkey.name).toBe("MacBook Pro");
    expect(inserted).toHaveLength(1);
  });

  it("rejects duplicate credentials during registration", async () => {
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: "credential_dup",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
      },
    });
    getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => createAwaitableQuery([{ id: "psk_existing" }]),
        }),
      }),
      insert: () => ({
        values: vi.fn(),
      }),
    });

    const registrationCookie =
      "kaisoumail_passkey_registration=" +
      encodeURIComponent(
        await (await import("../lib/crypto")).signPayload(
          {
            kind: "registration",
            challenge: "dup_challenge",
            name: "Existing",
            userId: authUser.id,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300,
          },
          baseConfig.SESSION_SECRET,
        ),
      );

    await expect(
      verifyPasskeyRegistrationForUser(
        {} as never,
        baseConfig,
        createCookieRequest(registrationCookie),
        authUser,
        {
          id: "credential_dup",
          rawId: "credential_dup",
          response: {
            attestationObject: "attestation",
            clientDataJSON: "client-data",
          },
          clientExtensionResults: {},
          type: "public-key",
        } as RegistrationResponseJSON,
      ),
    ).rejects.toMatchObject({
      message: "Passkey already registered",
      status: 409,
    });
  });

  it("rejects registration when verification fails", async () => {
    verifyRegistrationResponse.mockResolvedValue({
      verified: false,
    });
    const registrationCookie =
      "kaisoumail_passkey_registration=" +
      encodeURIComponent(
        await (await import("../lib/crypto")).signPayload(
          {
            kind: "registration",
            challenge: "bad_challenge",
            name: "Broken",
            userId: authUser.id,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300,
          },
          baseConfig.SESSION_SECRET,
        ),
      );

    await expect(
      verifyPasskeyRegistrationForUser(
        {} as never,
        baseConfig,
        createCookieRequest(registrationCookie),
        authUser,
        {
          id: "credential_bad",
          rawId: "credential_bad",
          response: {
            attestationObject: "attestation",
            clientDataJSON: "client-data",
          },
          clientExtensionResults: {},
          type: "public-key",
        } as RegistrationResponseJSON,
      ),
    ).rejects.toMatchObject({
      message: "Passkey registration failed",
      status: 400,
    });
  });

  it("updates counter and lastUsedAt after verified authentication", async () => {
    generateAuthenticationOptions.mockResolvedValue({
      challenge: "auth_challenge",
    });
    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        newCounter: 8,
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
      },
    });
    const updates: unknown[] = [];
    getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () =>
              createAwaitableQuery([
                {
                  userId: authUser.id,
                  passkeyId: "psk_1",
                  credentialId: "credential_auth",
                  publicKeyB64u: "AQID",
                  counter: 1,
                  transportsJson: JSON.stringify(["internal"]),
                  email: authUser.email,
                  name: authUser.name,
                  role: authUser.role,
                },
              ]),
          }),
        }),
      }),
      update: () => ({
        set: (values: unknown) => ({
          where: async () => {
            updates.push(values);
          },
        }),
      }),
    });

    const authCookie =
      "kaisoumail_passkey_authentication=" +
      encodeURIComponent(
        await (await import("../lib/crypto")).signPayload(
          {
            kind: "authentication",
            challenge: "auth_challenge",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300,
          },
          baseConfig.SESSION_SECRET,
        ),
      );

    const result = await verifyPasskeyAuthentication(
      {} as never,
      baseConfig,
      createCookieRequest(authCookie),
      {
        id: "credential_auth",
        rawId: "credential_auth",
        response: {
          authenticatorData: "auth-data",
          clientDataJSON: "client-data",
          signature: "signature",
        },
        clientExtensionResults: {},
        type: "public-key",
      } as AuthenticationResponseJSON,
    );

    expect(result.user.email).toBe(authUser.email);
    expect(updates).toHaveLength(1);
  });

  it("rejects authentication for revoked or missing credentials", async () => {
    getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => createAwaitableQuery([]),
          }),
        }),
      }),
    });

    const authCookie =
      "kaisoumail_passkey_authentication=" +
      encodeURIComponent(
        await (await import("../lib/crypto")).signPayload(
          {
            kind: "authentication",
            challenge: "auth_missing",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300,
          },
          baseConfig.SESSION_SECRET,
        ),
      );

    await expect(
      verifyPasskeyAuthentication(
        {} as never,
        baseConfig,
        createCookieRequest(authCookie),
        {
          id: "missing_credential",
          rawId: "missing_credential",
          response: {
            authenticatorData: "auth-data",
            clientDataJSON: "client-data",
            signature: "signature",
          },
          clientExtensionResults: {},
          type: "public-key",
        } as AuthenticationResponseJSON,
      ),
    ).rejects.toMatchObject({
      message: "Invalid passkey",
      status: 401,
    });
  });
});
