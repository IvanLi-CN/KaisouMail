import type { Meta, StoryObj } from "@storybook/react-vite";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import type { ApiMeta } from "@/lib/contracts";
import { appRoutes } from "@/lib/routes";
import {
  demoApiKeys,
  demoMeta,
  demoSessionUser,
  demoVersion,
} from "@/mocks/data";
import { ApiKeysDocsPageView } from "@/pages/api-keys-docs-page";
import { ApiKeysPageView } from "@/pages/api-keys-page";

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
    examples: [
      "build@alpha.mail.example.net",
      "spec@ops.alpha.ops.example.org",
    ],
  },
};

const RouteFlowHarness = ({
  latestSecret = null,
  meta = demoMeta,
}: {
  latestSecret?: string | null;
  meta?: ApiMeta;
}) => (
  <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
    <div className="space-y-4">
      <PathnameBadge />
      <Routes>
        <Route path="/" element={<Navigate to={appRoutes.apiKeys} replace />} />
        <Route
          path={appRoutes.apiKeys}
          element={
            <ApiKeysPageView
              apiKeys={demoApiKeys}
              latestSecret={latestSecret}
              onCreate={fn()}
              onRevoke={fn()}
            />
          }
        />
        <Route
          path={appRoutes.apiKeysDocs}
          element={<ApiKeysDocsPageView meta={meta} />}
        />
      </Routes>
    </div>
  </AppShell>
);

const meta = {
  title: "Pages/Api Keys",
  component: ApiKeysPageView,
  tags: ["autodocs"],
  args: {
    apiKeys: demoApiKeys,
    latestSecret: null,
    onCreate: fn(),
    onRevoke: fn(),
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

export const Overview: Story = {};

export const PaginatedFlow: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("heading", { name: "API Keys", level: 1 }),
    ).toBeInTheDocument();
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
  args: {
    latestSecret: "cfm_full_secret_returned_once",
  },
};

export const RouteFlow: Story = {
  render: () => <RouteFlowHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("heading", { name: "API Keys", level: 1 }),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/Path · \/api-keys/i)).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "API Keys" })).toHaveClass(
      /bg-secondary/,
    );

    await userEvent.click(canvas.getByRole("link", { name: "对接文档" }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole("heading", { name: "API 对接文档", level: 1 }),
      ).toBeInTheDocument();
    });
    await expect(
      canvas.getByText(/Path · \/api-keys\/docs/i),
    ).toBeInTheDocument();
    await expect(canvas.getByText("API Key Lifecycle")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "API Keys" })).toHaveClass(
      /bg-secondary/,
    );

    await userEvent.click(canvas.getByRole("link", { name: "回到 API Keys" }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole("heading", { name: "API Keys", level: 1 }),
      ).toBeInTheDocument();
    });
    await expect(canvas.getByText(/Path · \/api-keys/i)).toBeInTheDocument();
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
        canvas.getByRole("heading", { name: "API 对接文档", level: 1 }),
      ).toBeInTheDocument();
    });
    await expect(canvas.getByText("Automation / Agent")).toBeInTheDocument();
    await expect(canvas.getByText("/api/meta")).toBeInTheDocument();
    await expect(canvas.getByText("/api/domains/catalog")).toBeInTheDocument();
    await expect(canvas.getByText("/api/mailboxes/ensure")).toBeInTheDocument();
    await expect(canvas.getByText("/api/messages/:id/raw")).toBeInTheDocument();
  },
};
