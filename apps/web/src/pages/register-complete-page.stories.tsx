import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { expect, within } from "storybook/test";

import { sessionKeys } from "@/hooks/use-session";
import { demoAuthProviders, demoMeta } from "@/mocks/data";
import { RegisterCompletePage } from "@/pages/register-complete-page";

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
  queryClient.setQueryData(["auth", "registration", "pending_github"], {
    registration: {
      token: "pending_github",
      method: "github",
      sourceIntent: "register",
      redirectTo: "/workspace",
      inviteRequired: false,
      invitePrevalidated: false,
      canComplete: true,
      suggestedNickname: "Ivan Owner",
      error: null,
    },
  });

  return queryClient;
};

const meta = {
  title: "Pages/RegisterComplete",
  component: RegisterCompletePage,
  tags: ["autodocs"],
  parameters: {
    disableMemoryRouter: true,
  },
  render: () => (
    <QueryClientProvider client={buildQueryClient()}>
      <MemoryRouter
        initialEntries={["/register/complete?token=pending_github"]}
      >
        <RegisterCompletePage />
      </MemoryRouter>
    </QueryClientProvider>
  ),
} satisfies Meta<typeof RegisterCompletePage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "完成注册" }),
    ).toBeInTheDocument();
    await expect(canvas.getByLabelText("昵称")).toHaveValue("Ivan Owner");
  },
};
