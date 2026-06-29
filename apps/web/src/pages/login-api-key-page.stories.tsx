import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { expect, within } from "storybook/test";

import { sessionKeys } from "@/hooks/use-session";
import { LoginApiKeyPage } from "@/pages/login-api-key-page";

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

  return queryClient;
};

const meta = {
  title: "Pages/LoginApiKey",
  component: LoginApiKeyPage,
  tags: ["autodocs"],
  parameters: {
    disableMemoryRouter: true,
  },
  render: () => (
    <QueryClientProvider client={buildQueryClient()}>
      <MemoryRouter initialEntries={["/login/api-key"]}>
        <LoginApiKeyPage />
      </MemoryRouter>
    </QueryClientProvider>
  ),
} satisfies Meta<typeof LoginApiKeyPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "API Key 登录" }),
    ).toBeInTheDocument();
    await expect(canvas.getByLabelText("API Key")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "登录控制台" }),
    ).toBeInTheDocument();
  },
};
