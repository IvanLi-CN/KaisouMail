import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import { demoDomains, demoSessionUser, demoVersion } from "@/mocks/data";
import { DomainsPageView } from "@/pages/domains-page";

const meta = {
  title: "Pages/Domains",
  component: DomainsPageView,
  tags: ["autodocs"],
  args: {
    domains: demoDomains,
    isCreatePending: false,
    onCreate: fn(),
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

export const CreateFlow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("根域名"), "inbox.example.com");
    await userEvent.type(
      canvas.getByLabelText("Cloudflare Zone ID"),
      "zone_new",
    );
    await userEvent.click(canvas.getByRole("button", { name: "接入域名" }));
    await expect(args.onCreate).toHaveBeenCalledWith({
      rootDomain: "inbox.example.com",
      zoneId: "zone_new",
    });
  },
};

export const ProvisioningError: Story = {
  args: {
    domains: demoDomains.filter(
      (domain) =>
        domain.status !== "active" || domain.rootDomain !== "mail.example.net",
    ),
  },
};
