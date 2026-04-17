import { describe, expect, it } from "vitest";

import { ApiClientError } from "@/lib/api";
import { classifyDomainBindError } from "@/lib/domain-bind-errors";
import { buildPublicDocsLinks } from "@/lib/public-docs";

const docsLinks = buildPublicDocsLinks("https://docs.example.test");

if (!docsLinks) {
  throw new Error("docs links are required for bind error tests");
}

describe("classifyDomainBindError", () => {
  it("maps an existing Cloudflare child zone into catalog-enable guidance", () => {
    const hint = classifyDomainBindError(
      new ApiClientError(
        "Mailbox domain is already available in Cloudflare",
        {
          code: "subdomain_zone_available_in_catalog",
          mailDomain: "mail.customer.com",
          zoneId: "zone_mail_customer_com",
        },
        409,
      ),
      docsLinks,
      "mail.customer.com",
    );

    expect(hint).toEqual({
      title: "这个子域 zone 已经在 Cloudflare 里",
      docsHref:
        "https://docs.example.test/zh/domain-catalog-enablement#enable-zone-in-project",
      rawMessage:
        "请回到域名目录，找到 mail.customer.com 后点击“启用域名”；这条已有 zone 不需要再改走 apex 直绑。",
    });
  });

  it("falls back to catalog-enable guidance when the backend only returns a plain existing-zone message", () => {
    const hint = classifyDomainBindError(
      new Error("Mailbox domain is already available in Cloudflare"),
      docsLinks,
      "mail.customer.com",
    );

    expect(hint).toEqual({
      title: "这个子域 zone 已经在 Cloudflare 里",
      docsHref:
        "https://docs.example.test/zh/domain-catalog-enablement#enable-zone-in-project",
      rawMessage:
        "请回到域名目录，找到 mail.customer.com 后点击“启用域名”；这条已有 zone 不需要再改走 apex 直绑。",
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
