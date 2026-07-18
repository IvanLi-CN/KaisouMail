import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { expect, userEvent, within } from "storybook/test";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginCard } from "@/components/auth/login-card";
import { sessionKeys } from "@/hooks/use-session";
import { demoAuthProviders, demoMeta } from "@/mocks/data";
import { LoginPage } from "@/pages/login-page";

const neverSettled = () => new Promise<void>(() => undefined);

const buildQueryClient = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
      mutations: {
        retry: false,
      },
    },
  });

  queryClient.setQueryData(sessionKeys.all, null);
  queryClient.setQueryData(["auth", "providers"], demoAuthProviders);
  queryClient.setQueryData(["meta"], demoMeta);

  return queryClient;
};

const meta = {
  title: "Pages/Login",
  component: LoginPage,
  tags: ["autodocs"],
  parameters: {
    disableMemoryRouter: true,
  },
  render: () => (
    <QueryClientProvider client={buildQueryClient()}>
      <MemoryRouter initialEntries={["/login"]}>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>
  ),
} satisfies Meta<typeof LoginPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "登录 KaisouMail" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "使用 GitHub 登录" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "使用 LinuxDO 登录" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "使用 API Key 登录" }),
    ).toBeInTheDocument();
  },
};

export const ProviderPending: Story = {
  render: () => (
    <MemoryRouter initialEntries={["/login"]}>
      <AuthShell mode="login">
        <LoginCard
          onProviderLogin={() => neverSettled()}
          passkeySupported
          providers={demoAuthProviders}
        />
      </AuthShell>
    </MemoryRouter>
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
    <MemoryRouter initialEntries={["/login"]}>
      <AuthShell mode="login">
        <LoginCard
          onApiKeyLogin={() => neverSettled()}
          passkeySupported
          providers={demoAuthProviders}
        />
      </AuthShell>
    </MemoryRouter>
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
