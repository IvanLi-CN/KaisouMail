import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "../lib/crypto";
import {
  serializeExpiredSessionCookie,
  serializeSessionCookie,
} from "../services/auth";

describe("session signing", () => {
  it("round-trips a signed session payload", async () => {
    const token = await signSession(
      {
        sub: "usr_1",
        email: "owner@example.com",
        name: "Owner",
        role: "admin",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      "super-secret-session-key",
    );
    const payload = await verifySession(token, "super-secret-session-key");
    expect(payload?.sub).toBe("usr_1");
  });

  it("serializes session cookies", () => {
    expect(serializeSessionCookie("token", true)).toContain("Secure");
    expect(serializeExpiredSessionCookie(false)).toContain("Max-Age=0");
  });
});
