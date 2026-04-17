import { describe, expect, it } from "vitest";

import { ApiClientError } from "@/lib/api";
import { classifyDomainBindError } from "@/lib/domain-bind-errors";
import { buildPublicDocsLinks } from "@/lib/public-docs";

const docsLinks = buildPublicDocsLinks("https://docs.example.test");

if (!docsLinks) {
  throw new Error("docs links are required for bind error tests");
}

describe("classifyDomainBindError", () => {
  it("maps a plain direct-subdomain error into apex guidance", () => {
    const hint = classifyDomainBindError(
      new Error("Direct subdomain binding is not supported"),
      docsLinks,
      "mail.customer.com",
    );

    expect(hint).toEqual({
      title: "当前 Cloudflare 账号不支持直接绑定子域",
      docsHref:
        "https://docs.example.test/zh/project-domain-binding#bind-apex-only",
      rawMessage:
        "请改为绑定 customer.com，再在创建邮箱时把子域填成 mail，即可继续使用 user@mail.customer.com 这类地址。",
    });
  });

  it("maps the structured subdomain bind error into apex guidance", () => {
    const hint = classifyDomainBindError(
      new ApiClientError(
        "Direct subdomain binding is not supported",
        {
          code: "subdomain_direct_bind_not_supported",
          mailDomain: "mail.customer.com",
          recommendedApex: "customer.com",
          recommendedMailboxSubdomain: "mail",
        },
        400,
      ),
      docsLinks,
      "customer.com",
    );

    expect(hint).toEqual({
      title: "当前 Cloudflare 账号不支持直接绑定子域",
      docsHref:
        "https://docs.example.test/zh/project-domain-binding#bind-apex-only",
      rawMessage:
        "请改为绑定 customer.com，再在创建邮箱时把子域填成 mail，即可继续使用 user@mail.customer.com 这类地址。",
    });
  });

  it("falls back to the Cloudflare raw root-domain error when the backend has no structured details", () => {
    const hint = classifyDomainBindError(
      new Error(
        "Please ensure you are providing the root domain and not any subdomains (e.g., example.com, not subdomain.example.com)",
      ),
      docsLinks,
      "mail.customer.com",
    );

    expect(hint).toEqual({
      title: "当前 Cloudflare 账号不支持直接绑定子域",
      docsHref:
        "https://docs.example.test/zh/project-domain-binding#bind-apex-only",
      rawMessage:
        "请改为绑定 customer.com，再在创建邮箱时把子域填成 mail，即可继续使用 user@mail.customer.com 这类地址。",
    });
  });
});
