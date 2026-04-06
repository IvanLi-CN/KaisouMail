import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";

import { RouteErrorBoundary } from "@/app/route-error-boundary";
import { sessionKeys } from "@/hooks/use-session";
import { demoSessionUser } from "@/mocks/data";

const ThrowRoute = () => {
  throw new Error("Storybook simulated route crash");
};

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

const FatalRouteStory = () => {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <Outlet />,
        errorElement: <RouteErrorBoundary />,
        children: [{ index: true, element: <ThrowRoute /> }],
      },
    ],
    { initialEntries: ["/"] },
  );

  return (
    <QueryClientProvider client={buildQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
};

const meta = {
  title: "App/RouteErrorBoundary",
  render: () => <FatalRouteStory />,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    disableMemoryRouter: true,
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const FatalRoute: Story = {};
