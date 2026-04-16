import { describe, expect, it } from "vitest";

import { classifyMailDomain } from "@/lib/domain-classification";

describe("classifyMailDomain", () => {
  it("treats registrable domains as apex", () => {
    expect(classifyMailDomain("example.com")).toEqual({
      type: "apex",
      mailDomain: "example.com",
      registrableDomain: "example.com",
      parentDomain: null,
      delegatedLabel: null,
    });

    expect(classifyMailDomain("example.co.uk")).toEqual({
      type: "apex",
      mailDomain: "example.co.uk",
      registrableDomain: "example.co.uk",
      parentDomain: null,
      delegatedLabel: null,
    });
  });

  it("detects delegated child zones and extracts their parent domain and label", () => {
    expect(classifyMailDomain("mail.example.com")).toEqual({
      type: "subdomain",
      mailDomain: "mail.example.com",
      registrableDomain: "example.com",
      parentDomain: "example.com",
      delegatedLabel: "mail",
    });

    expect(classifyMailDomain("mail.ops.example.com")).toEqual({
      type: "subdomain",
      mailDomain: "mail.ops.example.com",
      registrableDomain: "example.com",
      parentDomain: "example.com",
      delegatedLabel: "mail.ops",
    });

    expect(classifyMailDomain("mail.example.co.uk")).toEqual({
      type: "subdomain",
      mailDomain: "mail.example.co.uk",
      registrableDomain: "example.co.uk",
      parentDomain: "example.co.uk",
      delegatedLabel: "mail",
    });
  });

  it("prefers the nearest known parent zone for nested delegated child zones", () => {
    expect(
      classifyMailDomain("ops.mail.example.com", {
        knownParentZones: ["example.com", "mail.example.com"],
      }),
    ).toEqual({
      type: "subdomain",
      mailDomain: "ops.mail.example.com",
      registrableDomain: "example.com",
      parentDomain: "mail.example.com",
      delegatedLabel: "ops",
    });
  });

  it("normalizes casing and returns unknown for empty or invalid inputs", () => {
    expect(classifyMailDomain(" Mail.Customer.COM ")).toEqual({
      type: "subdomain",
      mailDomain: "mail.customer.com",
      registrableDomain: "customer.com",
      parentDomain: "customer.com",
      delegatedLabel: "mail",
    });

    expect(classifyMailDomain("")).toEqual({
      type: "unknown",
      mailDomain: "",
      registrableDomain: null,
      parentDomain: null,
      delegatedLabel: null,
    });

    expect(classifyMailDomain("not a domain")).toEqual({
      type: "unknown",
      mailDomain: "not a domain",
      registrableDomain: null,
      parentDomain: null,
      delegatedLabel: null,
    });
  });
});
