import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { AppShell } from "@/components/layout/app-shell";
import {
  demoApiKeys,
  demoExternalAccounts,
  demoPasskeys,
  demoSessionUser,
  demoUsers,
  demoVersion,
} from "@/mocks/data";
import { ApiKeysPageView, type IdentityAuthTab } from "@/pages/api-keys-page";

const InteractiveApiKeysPageView = ({
  defaultTab = "account",
  ...props
}: Omit<
  ComponentProps<typeof ApiKeysPageView>,
  "activeTab" | "onActiveTabChange"
> & {
  defaultTab?: IdentityAuthTab;
}) => {
  const [activeTab, setActiveTab] = useState<IdentityAuthTab>(defaultTab);
  const [nicknameDraft, setNicknameDraft] = useState(props.nicknameDraft);

  return (
    <ApiKeysPageView
      {...props}
      activeTab={activeTab}
      nicknameDraft={nicknameDraft}
      onNicknameDraftChange={setNicknameDraft}
      onActiveTabChange={setActiveTab}
    />
  );
};

const meta = {
  title: "Pages/Identity Auth",
  component: ApiKeysPageView,
  tags: ["autodocs"],
  args: {
    account: demoUsers[0],
    externalAccounts: demoExternalAccounts.filter(
      (account) => account.id === "ext_github_owner",
    ),
    apiKeys: demoApiKeys,
    passkeys: demoPasskeys,
    activeTab: "account",
    nicknameDraft: demoUsers[0]?.nickname ?? "",
    passkeySupported: true,
    passkeyError: null,
    passkeyPending: false,
    latestSecret: null,
    accountPending: false,
    deletingAccount: false,
    externalAccountPendingId: null,
    accountError: null,
    onNicknameDraftChange: fn(),
    onAccountSave: fn(),
    onAccountDelete: fn(),
    onUnlinkExternalAccount: fn(),
    onBindProvider: fn(),
    onRetry: fn(),
    onRetryPasskeys: fn(),
    onActiveTabChange: fn(),
    onCreate: fn(),
    onRevoke: fn(),
    onCreatePasskey: fn(),
    onRevokePasskey: fn(),
  },
  render: (args) => (
    <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
      <InteractiveApiKeysPageView {...args} />
    </AppShell>
  ),
} satisfies Meta<typeof ApiKeysPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AccountOverview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByDisplayValue("@ivan")).toBeInTheDocument();
    await expect(canvas.getByText("Connected Accounts")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    apiKeys: [],
    passkeys: [],
    isApiKeysLoading: true,
    isPasskeysLoading: true,
  },
  render: (args) => (
    <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
      <InteractiveApiKeysPageView {...args} defaultTab="api-keys" />
    </AppShell>
  ),
};

export const ConnectedAccounts: Story = {
  args: {
    activeTab: "connected-accounts",
  },
  render: (args) => (
    <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
      <InteractiveApiKeysPageView {...args} defaultTab="connected-accounts" />
    </AppShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("@ivanli-cn")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "绑定 GitHub" }),
    ).toBeInTheDocument();
  },
};

export const Passkeys: Story = {
  render: (args) => (
    <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
      <InteractiveApiKeysPageView {...args} defaultTab="passkeys" />
    </AppShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("MacBook Pro")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "注册当前设备" }),
    ).toBeInTheDocument();
  },
};

export const ApiKeys: Story = {
  render: (args) => (
    <AppShell user={demoSessionUser} version={demoVersion} onLogout={fn()}>
      <InteractiveApiKeysPageView {...args} defaultTab="api-keys" />
    </AppShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "下一页" }));
    await expect(canvas.getByText("Bootstrap Admin")).toBeInTheDocument();
  },
};
