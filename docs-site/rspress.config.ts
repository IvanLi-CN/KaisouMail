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
  lang: "zh-CN",
  title: "CF Mail 文档",
  description:
    "CF Mail 的部署、域名接入、Cloudflare Token 权限、API 与运维文档。",
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
    nav: [
      { text: "首页", link: "/" },
      { text: "快速开始", link: "/quick-start" },
      { text: "Cloudflare Token", link: "/cloudflare-token-permissions" },
      { text: "Storybook", link: "/storybook.html" },
      {
        text: "GitHub",
        link: "https://github.com/IvanLi-CN/cf-mail",
      },
    ],
    sidebar: {
      "/": [
        {
          text: "文档",
          items: [
            { text: "首页", link: "/" },
            { text: "快速开始", link: "/quick-start" },
            { text: "部署与环境变量", link: "/deployment-environment" },
            {
              text: "Cloudflare Token 权限",
              link: "/cloudflare-token-permissions",
            },
            {
              text: "域名目录与启用流程",
              link: "/domain-catalog-enablement",
            },
            { text: "API 参考", link: "/api-reference" },
            { text: "FAQ / 故障排查", link: "/faq" },
          ],
        },
      ],
    },
  },
});
