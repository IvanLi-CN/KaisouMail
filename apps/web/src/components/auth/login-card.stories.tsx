import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { LoginCard } from "@/components/auth/login-card";
import { demoAuthProviders } from "@/mocks/data";

const neverSettled = () => new Promise<void>(() => undefined);

const meta = {
  title: "Auth/LoginCard",
  component: LoginCard,
  tags: ["autodocs"],
  args: {
    onPasskeySubmit: fn(),
    onProviderLogin: fn(),
    onApiKeyLogin: fn(),
    passkeyError: null,
    passkeySupported: true,
    passkeyButtonLabel: "使用 Passkey 登录",
    passkeySupportMessage: null,
    providers: demoAuthProviders,
  },
} satisfies Meta<typeof LoginCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "使用 Passkey 登录" }),
    );
    await expect(args.onPasskeySubmit).toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("button", { name: "使用 GitHub 登录" }),
    );
    await expect(args.onProviderLogin).toHaveBeenCalled();
    await expect(
      canvas.getByRole("button", { name: "使用 API Key 登录" }),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "使用 API Key 登录" }),
    );
    await expect(args.onApiKeyLogin).toHaveBeenCalled();
  },
};

export const PasskeyUnsupported: Story = {
  args: {
    passkeySupported: false,
  },
};

export const PasskeyPending: Story = {
  args: {
    isPasskeyPending: true,
  },
};

export const ProviderPending: Story = {
  render: () => (
    <LoginCard
      onProviderLogin={() => neverSettled()}
      passkeySupported
      providers={demoAuthProviders}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "使用 GitHub 登录" }),
    );
    await expect(
      canvas.getByRole("button", { name: "正在跳转 GitHub…" }),
    ).toBeInTheDocument();
  },
};

export const ApiKeyPending: Story = {
  render: () => (
    <LoginCard
      onApiKeyLogin={() => neverSettled()}
      passkeySupported
      providers={demoAuthProviders}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "使用 API Key 登录" }),
    );
    await expect(
      canvas.getByRole("button", { name: "正在前往 API Key 登录…" }),
    ).toBeInTheDocument();
  },
};

export const PasskeyUntrustedOrigin: Story = {
  args: {
    passkeySupported: false,
    passkeyButtonLabel: "当前域名未启用 Passkey",
    passkeySupportMessage:
      "当前页面来源未加入 WEB_APP_ORIGIN / WEB_APP_ORIGINS；请切换到受信控制台域名后再使用 Passkey。",
  },
};

export const PasskeyCrossSiteApiBase: Story = {
  args: {
    passkeySupported: false,
    passkeyButtonLabel: "当前环境不支持 Passkey",
    passkeySupportMessage:
      "当前控制台与 API 不在同一站点，Passkey challenge cookie 无法回传；请改用同站点域名，避免混用 localhost 与 127.0.0.1。",
  },
};
