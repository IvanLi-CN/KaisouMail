import { createMailboxRequestSchema } from "@cf-mail/shared";
import { describe, expect, it } from "vitest";

import {
  buildMailboxAddress,
  extractPreviewText,
  resolveDisposition,
} from "../lib/email";

describe("email helpers", () => {
  it("builds mailbox addresses", () => {
    expect(buildMailboxAddress("mail", "box", "example.com")).toEqual({
      localPart: "mail",
      subdomain: "box",
      rootDomain: "example.com",
      address: "mail@box.example.com",
    });
  });

  it("builds multi-level mailbox addresses", () => {
    expect(buildMailboxAddress("mail", "ops.alpha", "707979.xyz")).toEqual({
      localPart: "mail",
      subdomain: "ops.alpha",
      rootDomain: "707979.xyz",
      address: "mail@ops.alpha.707979.xyz",
    });
  });

  it("accepts dotted subdomains in mailbox creation payloads", () => {
    expect(
      createMailboxRequestSchema.parse({
        localPart: "mail",
        subdomain: "ops.alpha",
        expiresInMinutes: 60,
      }),
    ).toMatchObject({
      subdomain: "ops.alpha",
    });
  });

  it("still accepts an explicit root domain in mailbox creation payloads", () => {
    expect(
      createMailboxRequestSchema.parse({
        localPart: "mail",
        subdomain: "ops.alpha",
        rootDomain: "707979.xyz",
        expiresInMinutes: 60,
      }),
    ).toMatchObject({
      rootDomain: "707979.xyz",
    });
  });

  it("rejects malformed dotted subdomains", () => {
    expect(() =>
      createMailboxRequestSchema.parse({
        localPart: "mail",
        subdomain: "ops..alpha",
        rootDomain: "707979.xyz",
        expiresInMinutes: 60,
      }),
    ).toThrow();
  });

  it("extracts preview text from plain text first", () => {
    expect(extractPreviewText("hello   world", "<p>ignored</p>")).toBe(
      "hello world",
    );
  });

  it("falls back to stripped html", () => {
    expect(
      extractPreviewText(null, "<p>Hello <strong>there</strong></p>"),
    ).toBe("Hello there");
  });

  it("normalizes attachment disposition", () => {
    expect(resolveDisposition("inline")).toBe("inline");
    expect(resolveDisposition("attachment")).toBe("attachment");
    expect(resolveDisposition("mystery")).toBe("unknown");
  });
});
