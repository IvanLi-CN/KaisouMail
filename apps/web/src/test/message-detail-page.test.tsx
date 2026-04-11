import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { demoMessageDetails } from "@/mocks/data";
import {
  MessageDetailPage,
  MessageDetailPageView,
} from "@/pages/message-detail-page";

const messageDetailHookState = {
  data: demoMessageDetails.msg_alpha as
    | typeof demoMessageDetails.msg_alpha
    | undefined,
  error: null as Error | null,
  isLoading: false,
  isFetching: false,
  dataUpdatedAt: 1_713_526_800_000,
};
const refreshState = {
  refresh: vi.fn(),
  isRefreshing: false,
};

vi.mock("@/hooks/use-messages", () => ({
  messageKeys: {
    detail: (messageId: string) => ["message", messageId],
  },
  useMessageDetailQuery: () => messageDetailHookState,
}));

vi.mock("@/hooks/use-query-refresh", () => ({
  useQueryRefresh: () => refreshState,
}));

vi.mock("@/lib/message-read-state", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/message-read-state")
  >("@/lib/message-read-state");

  return {
    ...actual,
    markMessageAsRead: vi.fn(),
  };
});

afterEach(() => {
  messageDetailHookState.data = demoMessageDetails.msg_alpha;
  messageDetailHookState.error = null;
  messageDetailHookState.isLoading = false;
  messageDetailHookState.isFetching = false;
  messageDetailHookState.dataUpdatedAt = 1_713_526_800_000;
  refreshState.refresh = vi.fn();
  refreshState.isRefreshing = false;
});

describe("message detail page view", () => {
  it("renders a recoverable error state", () => {
    render(
      <MemoryRouter>
        <MessageDetailPageView
          message={null}
          error={{
            variant: "recoverable",
            title: "邮件详情加载失败",
            description: "正文、附件和 headers 现在还没拿到。",
            details: '{"error":"Request failed"}',
          }}
          onRetry={vi.fn()}
          isRefreshing={false}
          lastRefreshedAt={null}
          mailboxHref="/mailboxes"
          workspaceHref="/workspace"
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "邮件详情加载失败" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新加载邮件详情" }),
    ).toBeInTheDocument();
  });

  it("renders the detail card when data is available", () => {
    render(
      <MemoryRouter>
        <MessageDetailPageView
          message={demoMessageDetails.msg_alpha}
          isRefreshing={false}
          lastRefreshedAt={null}
          mailboxHref="/mailboxes"
          workspaceHref="/workspace"
        />
      </MemoryRouter>,
    );

    expect(
      screen.getAllByRole("heading", { name: "Build artifacts ready" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Nightly bundle is ready. Use verification code 842911 to unlock the preview URL.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the current message visible when a detail refetch fails over cached data", () => {
    messageDetailHookState.data = demoMessageDetails.msg_alpha;
    messageDetailHookState.error = new Error("detail refetch failed");

    render(
      <MemoryRouter initialEntries={["/messages/msg_alpha"]}>
        <Routes>
          <Route path="/messages/:messageId" element={<MessageDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getAllByRole("heading", { name: "Build artifacts ready" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("heading", { name: "邮件详情加载失败" }),
    ).not.toBeInTheDocument();
  });
});
