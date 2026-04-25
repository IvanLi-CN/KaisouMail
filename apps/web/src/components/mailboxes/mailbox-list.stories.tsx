import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { MailboxList } from "@/components/mailboxes/mailbox-list";
import { demoMailboxes } from "@/mocks/data";

const statusDemoMailboxes = [
  {
    ...demoMailboxes[0],
    id: "mbx_status_active",
    address: "active@status.relay.example.test",
    status: "active" as const,
    routingRuleId: "rule_status_active",
  },
  {
    ...demoMailboxes[1],
    id: "mbx_status_expired",
    address: "expired@trash.relay.example.test",
    status: "expired" as const,
    expiresAt: "2026-04-01T07:15:00.000Z",
    routingRuleId: "rule_status_expired",
  },
  {
    ...demoMailboxes[1],
    id: "mbx_status_destroying",
    address: "destroying@status.relay.example.test",
    status: "destroying" as const,
    routingRuleId: "rule_status_destroying",
  },
  {
    ...demoMailboxes[2],
    id: "mbx_status_destroyed",
    address: "destroyed@status.relay.example.test",
    status: "destroyed" as const,
    destroyedAt: "2026-04-01T08:20:00.000Z",
    routingRuleId: null,
  },
];

const statusDemoStats = new Map([
  ["mbx_status_active", { unread: 2, total: 4 }],
  ["mbx_status_expired", { unread: 0, total: 3 }],
  ["mbx_status_destroying", { unread: 0, total: 1 }],
  ["mbx_status_destroyed", { unread: 0, total: 8 }],
]);

const meta = {
  title: "Mailboxes/MailboxList",
  component: MailboxList,
  tags: ["autodocs"],
  args: {
    mailboxes: demoMailboxes,
    messageStatsByMailbox: new Map([
      ["mbx_alpha", { unread: 1, total: 1 }],
      ["mbx_beta", { unread: 1, total: 1 }],
      ["mbx_catch_all", { unread: 1, total: 1 }],
      ["mbx_gamma", { unread: 0, total: 0 }],
    ]),
    onDestroy: fn(),
  },
} satisfies Meta<typeof MailboxList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ActiveOnly: Story = {
  args: {
    mailboxes: demoMailboxes.filter((mailbox) => mailbox.status === "active"),
  },
};

export const IncludesDestroyed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("未读 / 全部")).toBeInTheDocument();
    await expect(
      canvas.queryByText(/active|destroyed/i),
    ).not.toBeInTheDocument();
  },
};

export const CatchAllBadge: Story = {
  args: {
    mailboxes: demoMailboxes.filter(
      (mailbox) => mailbox.id === "mbx_catch_all" || mailbox.id === "mbx_alpha",
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Catch All")).toBeInTheDocument();
    await expect(canvas.getByText("预注册")).toBeInTheDocument();
    await expect(canvas.getByText("长期")).toBeInTheDocument();
  },
};

export const StatusSegmentsAndExpiredActions: Story = {
  args: {
    mailboxes: statusDemoMailboxes,
    messageStatsByMailbox: statusDemoStats,
    onRestoreTtl: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Covers the four mailbox statuses used by the /mailboxes segmented filter. Expired rows use recycle-bin language, link to mailbox history, and keep both restore and immediate destroy actions available.",
      },
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("可用")).toBeInTheDocument();
    await expect(canvas.getByText("已过期 · 回收站")).toBeInTheDocument();
    await expect(canvas.getByText("销毁中")).toBeInTheDocument();
    await expect(canvas.getByText("已销毁")).toBeInTheDocument();
    await expect(canvas.getByText(/回收站 ·/)).toBeInTheDocument();
    await expect(
      canvas.getAllByRole("link", { name: "查看历史" })[0],
    ).toHaveAttribute("href", "/mailboxes/mbx_status_expired");

    await userEvent.click(canvas.getByRole("button", { name: "延长 TTL" }));
    await expect(args.onRestoreTtl).toHaveBeenCalledWith(
      expect.objectContaining({ id: "mbx_status_expired" }),
    );

    await userEvent.click(canvas.getByRole("button", { name: "立即销毁" }));
    await expect(args.onDestroy).toHaveBeenCalledWith("mbx_status_expired");
  },
};
