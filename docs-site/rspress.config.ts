import { defineConfig } from "rspress/config";

function normalizeBase(base: string | undefined) {
  const raw = (base ?? "/").trim();
  if (!raw || raw === "/") return "/";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

const docsBase = normalizeBase(process.env.DOCS_BASE);
const localStorybookDevOrigin =
  process.env.VITE_STORYBOOK_DEV_ORIGIN?.trim() ?? "";

export default defineConfig({
  root: "docs",
  base: docsBase,
  lang: "en",
  locales: [
    {
      lang: "en",
      label: "English",
      title: "CF Mail Docs",
      description:
        "Deployment, domain onboarding, Cloudflare token, API, and operator docs for CF Mail.",
    },
    {
      lang: "zh",
      label: "简体中文",
      title: "CF Mail 文档",
      description:
        "CF Mail 的部署、域名接入、Cloudflare Token 权限、API 与运维文档。",
    },
  ],
  builderConfig: {
    source: {
      define: {
        "process.env.RSPRESS_STORYBOOK_DEV_ORIGIN": JSON.stringify(
          localStorybookDevOrigin,
        ),
      },
    },
  },
  themeConfig: {
    search: true,
    localeRedirect: "never",
    locales: [
      {
        lang: "en",
        label: "English",
        title: "CF Mail Docs",
        description:
          "Deployment, domain onboarding, Cloudflare token, API, and operator docs for CF Mail.",
        nav: [
          { text: "Home", link: "/" },
          { text: "Quick Start", link: "/quick-start" },
          { text: "Deployment", link: "/deployment-environment" },
          { text: "Cloudflare Token", link: "/cloudflare-token-permissions" },
          { text: "Storybook", link: "/storybook.html" },
          {
            text: "GitHub",
            link: "https://github.com/IvanLi-CN/cf-mail",
            position: "right",
          },
        ],
        sidebar: {
          "/": [
            {
              text: "Documentation",
              items: [
                { text: "Home", link: "/" },
                { text: "Quick Start", link: "/quick-start" },
                {
                  text: "Deployment & Environment",
                  link: "/deployment-environment",
                },
                {
                  text: "Cloudflare Token Permissions",
                  link: "/cloudflare-token-permissions",
                },
                {
                  text: "Domain Catalog & Enablement",
                  link: "/domain-catalog-enablement",
                },
                { text: "API Reference", link: "/api-reference" },
                { text: "FAQ & Troubleshooting", link: "/faq" },
              ],
            },
          ],
        },
      },
      {
        lang: "zh",
        label: "简体中文",
        title: "CF Mail 文档",
        description:
          "CF Mail 的部署、域名接入、Cloudflare Token 权限、API 与运维文档。",
        nav: [
          { text: "首页", link: "/zh/" },
          { text: "快速开始", link: "/zh/quick-start" },
          { text: "部署", link: "/zh/deployment-environment" },
          {
            text: "Cloudflare Token",
            link: "/zh/cloudflare-token-permissions",
          },
          { text: "Storybook", link: "/zh/storybook.html" },
          {
            text: "GitHub",
            link: "https://github.com/IvanLi-CN/cf-mail",
            position: "right",
          },
        ],
        sidebar: {
          "/zh/": [
            {
              text: "文档",
              items: [
                { text: "首页", link: "/zh/" },
                { text: "快速开始", link: "/zh/quick-start" },
                { text: "部署与环境变量", link: "/zh/deployment-environment" },
                {
                  text: "Cloudflare Token 权限",
                  link: "/zh/cloudflare-token-permissions",
                },
                {
                  text: "域名目录与启用流程",
                  link: "/zh/domain-catalog-enablement",
                },
                { text: "API 参考", link: "/zh/api-reference" },
                { text: "FAQ / 故障排查", link: "/zh/faq" },
              ],
            },
          ],
        },
      },
    ],
  },
});
