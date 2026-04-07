import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { sessionKeys } from "@/hooks/use-session";
import { demoSessionUser } from "@/mocks/data";
import { NotFoundPage } from "@/pages/not-found-page";

const buildQueryClient = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });

  queryClient.setQueryData(sessionKeys.all, { user: demoSessionUser });

  return queryClient;
};

const meta = {
  title: "Pages/Not Found",
  component: NotFoundPage,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    disableMemoryRouter: true,
  },
  render: () => (
    <QueryClientProvider client={buildQueryClient()}>
      <MemoryRouter initialEntries={["/missing/preview"]}>
        <NotFoundPage />
      </MemoryRouter>
    </QueryClientProvider>
  ),
} satisfies Meta<typeof NotFoundPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LoggedInNotFound: Story = {};
