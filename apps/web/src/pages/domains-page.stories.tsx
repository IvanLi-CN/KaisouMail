import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import { demoDomainCatalog, demoSessionUser, demoVersion } from "@/mocks/data";
import { DomainsPageView } from "@/pages/domains-page";

const meta = {
  title: "Pages/Domains",
  component: DomainsPageView,
  tags: ["autodocs"],
  args: {
    domains: demoDomainCatalog,
    isEnablePending: false,
    onEnable: fn(),
    onDisable: fn(),
    onRetry: fn(),
  },
  render: (args) => (
    <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
      <DomainsPageView {...args} />
    </AppShell>
  ),
} satisfies Meta<typeof DomainsPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};

export const EnableFlow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "启用域名" }));
    await expect(args.onEnable).toHaveBeenCalledWith({
      rootDomain: "ops.example.org",
      zoneId: "zone_available",
    });
  },
};

export const ProvisioningError: Story = {
  args: {
    domains: demoDomainCatalog.filter(
      (domain) =>
        domain.projectStatus !== "active" ||
        domain.rootDomain !== "mail.example.net",
    ),
  },
};

export const MissingInCloudflare: Story = {
  args: {
    domains: [
      ...demoDomainCatalog,
      {
        id: "dom_missing",
        rootDomain: "orphaned.example.io",
        zoneId: "zone_missing",
        cloudflareAvailability: "missing",
        projectStatus: "disabled",
        lastProvisionError: null,
        createdAt: "2026-04-01T08:45:00.000Z",
        updatedAt: "2026-04-01T08:50:00.000Z",
        lastProvisionedAt: "2026-04-01T08:47:00.000Z",
        disabledAt: "2026-04-01T08:50:00.000Z",
      },
    ],
  },
};
