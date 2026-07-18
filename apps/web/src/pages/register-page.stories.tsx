import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { expect, fn, userEvent, within } from "storybook/test";

import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterCard } from "@/components/auth/register-card";
import { sessionKeys } from "@/hooks/use-session";
import { demoAuthProviders, demoMeta } from "@/mocks/data";
import { RegisterPage } from "@/pages/register-page";

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
  title: "Pages/Register",
  component: RegisterPage,
  tags: ["autodocs"],
  parameters: {
    disableMemoryRouter: true,
  },
  render: () => (
    <QueryClientProvider client={buildQueryClient()}>
      <MemoryRouter initialEntries={["/register"]}>
        <RegisterPage />
      </MemoryRouter>
    </QueryClientProvider>
  ),
} satisfies Meta<typeof RegisterPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "注册 KaisouMail" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "使用 GitHub 继续" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "使用 LinuxDO 继续" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "使用 Passkey 继续" }),
    ).toBeInTheDocument();
  },
};

export const ProviderPending: Story = {
  render: () => (
    <MemoryRouter initialEntries={["/register"]}>
      <AuthShell mode="register">
        <RegisterCard
          onProviderRegister={() => neverSettled()}
          onPasskeyStart={fn()}
          passkeySupported
          providers={demoAuthProviders}
        />
      </AuthShell>
    </MemoryRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "使用 GitHub 继续" }),
    );
    await expect(
      canvas.getByRole("button", { name: "正在跳转 GitHub…" }),
    ).toBeInTheDocument();
  },
};

export const PasskeyPending: Story = {
  render: () => (
    <MemoryRouter initialEntries={["/register"]}>
      <AuthShell mode="register">
        <RegisterCard
          onProviderRegister={fn()}
          onPasskeyStart={() => neverSettled()}
          passkeySupported
          providers={demoAuthProviders}
        />
      </AuthShell>
    </MemoryRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "使用 Passkey 继续" }),
    );
    await expect(
      canvas.getByRole("button", { name: "正在准备 Passkey…" }),
    ).toBeInTheDocument();
  },
};
