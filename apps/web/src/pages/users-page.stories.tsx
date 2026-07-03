import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import { buildPublicDocsLinks } from "@/lib/public-docs";
import {
  demoAdminUsers,
  demoInvites,
  demoRegistrationSettings,
  demoSessionUser,
  demoVersion,
} from "@/mocks/data";
import { UsersPageView } from "@/pages/users-page";

const docsLinks = buildPublicDocsLinks("https://docs.example.test");

if (!docsLinks) {
  throw new Error("docs links are required for users stories");
}

const meta = {
  title: "Pages/Users",
  component: UsersPageView,
  tags: ["autodocs"],
  args: {
    section: "users",
    users: demoAdminUsers,
    invites: demoInvites,
    settings: demoRegistrationSettings,
    currentAdminUserId: demoSessionUser.id,
    currentAdmin: {
      user: demoSessionUser,
      externalAccounts: demoAdminUsers[0]?.externalAccounts ?? [],
      hasPasskeys: (demoAdminUsers[0]?.passkeyCount ?? 0) > 0,
    },
    onCreateInvite: fn(),
    onDeleteInvite: fn(),
    onUpdateSettings: fn(),
    onTransferAdmin: fn(),
  },
  render: (args) => (
    <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
      <UsersPageView {...args} />
    </AppShell>
  ),
} satisfies Meta<typeof UsersPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("@ivan").length).toBeGreaterThan(0);
    await expect(canvas.getByRole("button", { name: "用户" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
};

export const InviteFlow: Story = {
  args: {
    section: "invites",
    currentAdmin: {
      user: demoSessionUser,
      externalAccounts: demoAdminUsers[0]?.externalAccounts ?? [],
      hasPasskeys: (demoAdminUsers[0]?.passkeyCount ?? 0) > 0,
    },
    onCreateInvite: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("备注"), "QA onboarding");
    await userEvent.clear(canvas.getByLabelText("数量"));
    await userEvent.type(canvas.getByLabelText("数量"), "6");
    await userEvent.click(
      canvas.getByRole("button", { name: "批量生成邀请码" }),
    );
    await expect(args.onCreateInvite).toHaveBeenCalled();
  },
};

export const RegistrationOAuthSettings: Story = {
  args: {
    section: "registration",
    docsLinks,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "OAuth 配置说明" }),
    ).toHaveAttribute(
      "href",
      "https://docs.example.test/zh/oauth-configuration",
    );
    await expect(
      canvas.getByText(/\/api\/auth\/github\/callback$/),
    ).toBeInTheDocument();
  },
};

export const RegistrationOAuthSettingsLinuxDO: Story = {
  args: {
    section: "registration",
    docsLinks,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const expandButtons = canvas.getAllByRole("button", {
      name: "展开配置",
    });
    const linuxdoExpandButton = expandButtons[0];
    if (!linuxdoExpandButton) {
      throw new Error("Expected LinuxDO expand button");
    }
    await userEvent.click(linuxdoExpandButton);

    await expect(
      canvas.getByText(/\/api\/auth\/linuxdo\/callback$/),
    ).toBeInTheDocument();
  },
};

export const UsersLoading: Story = {
  args: {
    section: "users",
    users: [],
    isUsersLoading: true,
  },
};

export const InvitesLoading: Story = {
  args: {
    section: "invites",
    invites: [],
    isInvitesLoading: true,
  },
};

export const RegistrationLoading: Story = {
  args: {
    section: "registration",
    isSettingsLoading: true,
  },
};
