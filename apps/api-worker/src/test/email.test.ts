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
      address: "mail@box.example.com",
    });
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
