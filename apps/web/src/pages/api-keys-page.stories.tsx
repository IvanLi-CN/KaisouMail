import { buildRealisticMailboxAddressExamples } from "@kaisoumail/shared";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import type { ApiMeta } from "@/lib/contracts";
import { buildPublicDocsLinks } from "@/lib/public-docs";
import { appRoutes } from "@/lib/routes";
import {
  demoApiKeys,
  demoMeta,
  demoPasskeys,
  demoSessionUser,
  demoVersion,
} from "@/mocks/data";
import { ApiKeysDocsPageView } from "@/pages/api-keys-docs-page";
import { ApiKeysPageView, type IdentityAuthTab } from "@/pages/api-keys-page";

const PathnameBadge = () => {
  const location = useLocation();

  return (
    <div className="mb-4 flex justify-end">
      <span className="rounded-md border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-secondary-foreground">
        Path · {location.pathname}
      </span>
    </div>
  );
};

const docsReferenceMeta: ApiMeta = {
  ...demoMeta,
  domains: ["mail.example.net", "ops.example.org"],
  addressRules: {
    ...demoMeta.addressRules,
    examples: buildRealisticMailboxAddressExamples([
      "mail.example.net",
      "ops.example.org",
    ]),
  },
};

const docsReferenceLinks = buildPublicDocsLinks(
  "https://ivanli-cn.github.io/KaisouMail",
);

const InteractiveApiKeysPageView = ({
  defaultTab = "api-keys",
  ...props
}: Omit<
  ComponentProps<typeof ApiKeysPageView>,
  "activeTab" | "onActiveTabChange"
> & {
  defaultTab?: IdentityAuthTab;
}) => {
  const [activeTab, setActiveTab] = useState<IdentityAuthTab>(defaultTab);

  return (
    <ApiKeysPageView
      {...props}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
    />
  );
};

const RouteFlowHarness = ({
  latestSecret = null,
  meta = demoMeta,
  passkeySupported = true,
  defaultTab = "api-keys",
}: {
  latestSecret?: string | null;
  meta?: ApiMeta;
  passkeySupported?: boolean;
  defaultTab?: IdentityAuthTab;
}) => (
  <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
    <div className="space-y-4">
      <PathnameBadge />
      <Routes>
        <Route path="/" element={<Navigate to={appRoutes.apiKeys} replace />} />
        <Route
          path={appRoutes.apiKeys}
          element={
            <InteractiveApiKeysPageView
              apiKeys={demoApiKeys}
              passkeys={demoPasskeys}
              defaultTab={defaultTab}
              passkeySupported={passkeySupported}
              passkeyError={null}
              passkeyPending={false}
              latestSecret={latestSecret}
              onCreate={fn()}
              onRevoke={fn()}
              onCreatePasskey={fn()}
              onRevokePasskey={fn()}
            />
          }
        />
        <Route
          path={appRoutes.apiKeysDocs}
          element={
            <ApiKeysDocsPageView meta={meta} docsLinks={docsReferenceLinks} />
          }
        />
      </Routes>
    </div>
  </AppShell>
);

const meta = {
  title: "Pages/Identity Auth",
  component: ApiKeysPageView,
  tags: ["autodocs"],
  args: {
    apiKeys: demoApiKeys,
    passkeys: demoPasskeys,
    activeTab: "api-keys",
    passkeySupported: true,
    passkeyError: null,
    passkeyPending: false,
    latestSecret: null,
    onCreate: fn(),
    onRevoke: fn(),
    onActiveTabChange: fn(),
    onCreatePasskey: fn(),
    onRevokePasskey: fn(),
  },
} satisfies Meta<typeof ApiKeysPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

const getRenderedKeyNames = (canvas: ReturnType<typeof within>) =>
  canvas
    .getAllByRole("row")
    .slice(1)
    .map((row: HTMLElement) => {
      const [nameCell] = within(row).getAllByRole("cell");
      return nameCell?.querySelector("p")?.textContent ?? "";
    });

export const Overview: Story = {
  render: (args) => <InteractiveApiKeysPageView {...args} />,
};

export const PaginatedFlow: Story = {
  render: (args) => <InteractiveApiKeysPageView {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("heading", { name: "身份认证", level: 1 }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("tab", { name: /API Keys/i }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByText("第 1 / 2 页")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(getRenderedKeyNames(canvas)).toEqual([
      "Support Bridge",
      "Webhook Mirror",
      "ivan",
      "Docs Robot",
      "Deploy Bot",
      "Ops Console",
      "Nightly Sync",
      "Smoke Test Key",
      "Recovery API Key",
      "Audit Trail",
    ]);

    await userEvent.click(canvas.getByRole("button", { name: "下一页" }));

    await expect(canvas.getByText("第 2 / 2 页")).toBeInTheDocument();
    expect(getRenderedKeyNames(canvas)).toEqual([
      "Subdomain Sync",
      "CI Robot",
      "Bootstrap Admin",
    ]);
  },
};

export const WithLatestSecret: Story = {
  render: (args) => <InteractiveApiKeysPageView {...args} />,
  args: {
    latestSecret: "cfm_full_secret_returned_once",
  },
};

export const PasskeyTab: Story = {
  render: (args) => (
    <InteractiveApiKeysPageView {...args} defaultTab="passkey" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("tab", { name: /Passkey/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      canvas.getByRole("heading", { name: "注册 Passkey", level: 2 }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: "已注册 Passkeys", level: 2 }),
    ).toBeInTheDocument();
  },
};

export const PasskeyTabUntrustedOrigin: Story = {
  render: (args) => (
    <InteractiveApiKeysPageView
      {...args}
      defaultTab="passkey"
      passkeySupported={false}
      passkeyError="当前页面来源未加入 WEB_APP_ORIGIN / WEB_APP_ORIGINS；请切换到受信控制台域名后再使用 Passkey。"
      passkeyEmptyMessage="当前页面来源未加入 WEB_APP_ORIGIN / WEB_APP_ORIGINS；请切换到受信控制台域名后再使用 Passkey。"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("tab", { name: /Passkey/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      canvas.getByText(
        "当前页面来源未加入 WEB_APP_ORIGIN / WEB_APP_ORIGINS；请切换到受信控制台域名后再使用 Passkey。",
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "注册当前设备" }),
    ).toBeDisabled();
    await expect(canvas.getByText("MacBook Pro")).toBeInTheDocument();
  },
};

export const PasskeyTabCrossSiteApiBase: Story = {
  render: (args) => (
    <InteractiveApiKeysPageView
      {...args}
      defaultTab="passkey"
      passkeySupported={false}
      passkeyError="当前控制台与 API 不在同一站点，Passkey challenge cookie 无法回传；请改用同站点域名，避免混用 localhost 与 127.0.0.1。"
      passkeyEmptyMessage="当前控制台与 API 不在同一站点，Passkey challenge cookie 无法回传；请改用同站点域名，避免混用 localhost 与 127.0.0.1。"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("tab", { name: /Passkey/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      canvas.getByText(
        "当前控制台与 API 不在同一站点，Passkey challenge cookie 无法回传；请改用同站点域名，避免混用 localhost 与 127.0.0.1。",
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "注册当前设备" }),
    ).toBeDisabled();
    await expect(canvas.getByText("MacBook Pro")).toBeInTheDocument();
  },
};

export const RouteFlow: Story = {
  render: () => <RouteFlowHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("heading", { name: "身份认证", level: 1 }),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/Path · \/api-keys/i)).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "身份认证" })).toHaveClass(
      /bg-secondary/,
    );
    await expect(
      canvas.getByRole("tab", { name: /API Keys/i }),
    ).toHaveAttribute("aria-selected", "true");

    await userEvent.click(canvas.getByRole("tab", { name: /Passkey/i }));
    await expect(canvas.getByRole("tab", { name: /Passkey/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      canvas.getByRole("heading", { name: "注册 Passkey", level: 2 }),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("link", { name: "对接文档" }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole("heading", { name: "API 对接速查", level: 1 }),
      ).toBeInTheDocument();
    });
    await expect(
      canvas.getByText(/Path · \/api-keys\/docs/i),
    ).toBeInTheDocument();
    await expect(canvas.getByText("API Key Lifecycle")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "身份认证" })).toHaveClass(
      /bg-secondary/,
    );

    await userEvent.click(canvas.getByRole("link", { name: "回到身份认证" }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole("heading", { name: "身份认证", level: 1 }),
      ).toBeInTheDocument();
    });
    await expect(canvas.getByText(/Path · \/api-keys/i)).toBeInTheDocument();
  },
};

export const RouteFlowPasskey: Story = {
  render: () => <RouteFlowHarness defaultTab="passkey" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("heading", { name: "身份认证", level: 1 }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: /Passkey/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      canvas.getByRole("heading", { name: "注册 Passkey", level: 2 }),
    ).toBeInTheDocument();
  },
};

export const DocsReference: Story = {
  render: () => (
    <RouteFlowHarness
      latestSecret="cfm_full_secret_returned_once"
      meta={docsReferenceMeta}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("link", { name: "对接文档" }));
    await waitFor(async () => {
      await expect(
        canvas.getByRole("heading", { name: "API 对接速查", level: 1 }),
      ).toBeInTheDocument();
    });
    await expect(canvas.getByText("Automation / Agent")).toBeInTheDocument();
    await expect(canvas.getByText("/api/meta")).toBeInTheDocument();
    await expect(canvas.getByText("/api/domains/catalog")).toBeInTheDocument();
    await expect(canvas.getByText("/api/mailboxes/ensure")).toBeInTheDocument();
    await expect(canvas.getByText("/api/messages/:id/raw")).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "公开文档站" }),
    ).toHaveAttribute("href", "https://ivanli-cn.github.io/KaisouMail/zh/");
  },
};

export const PasskeyUnsupported: Story = {
  render: () => (
    <RouteFlowHarness passkeySupported={false} defaultTab="passkey" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "当前浏览器不支持 Passkey" }),
    ).toBeDisabled();
    await expect(
      canvas.getByText("当前浏览器或上下文不支持 passkey 注册。"),
    ).toBeInTheDocument();
  },
};
