import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { demoMailboxes, demoMessages, demoMeta } from "@/mocks/data";
import { MailboxesPage } from "@/pages/mailboxes-page";

const mailboxesPageState: {
  meta: typeof demoMeta | undefined;
  metaError: Error | null;
  mailboxes: typeof demoMailboxes | undefined;
  mailboxesError: Error | null;
  messages: typeof demoMessages | undefined;
  messagesError: Error | null;
  refresh: ReturnType<typeof vi.fn>;
  refetchMeta: ReturnType<typeof vi.fn>;
} = {
  meta: demoMeta,
  metaError: null as Error | null,
  mailboxes: demoMailboxes,
  mailboxesError: null as Error | null,
  messages: demoMessages,
  messagesError: null as Error | null,
  refresh: vi.fn(),
  refetchMeta: vi.fn(),
};

vi.mock("@/hooks/use-meta", () => ({
  useMetaQuery: () => ({
    data: mailboxesPageState.meta,
    error: mailboxesPageState.metaError,
    isLoading: false,
    refetch: mailboxesPageState.refetchMeta,
  }),
}));

vi.mock("@/hooks/use-mailboxes", () => ({
  mailboxKeys: {
    all: ["mailboxes"],
  },
  useMailboxesQuery: () => ({
    data: mailboxesPageState.mailboxes,
    error: mailboxesPageState.mailboxesError,
    isFetching: false,
    dataUpdatedAt: 1_713_526_800_000,
  }),
  useCreateMailboxMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useDestroyMailboxMutation: () => ({
    mutate: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-messages", () => ({
  messageKeys: {
    all: ["messages"],
  },
  useMessagesQuery: () => ({
    data: mailboxesPageState.messages,
    error: mailboxesPageState.messagesError,
    isFetching: false,
    dataUpdatedAt: 1_713_526_800_000,
  }),
}));

vi.mock("@/hooks/use-query-refresh", () => ({
  useQueryRefresh: () => ({
    refresh: mailboxesPageState.refresh,
    isRefreshing: false,
  }),
}));

vi.mock("@/lib/message-read-state", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/message-read-state")
  >("@/lib/message-read-state");

  return {
    ...actual,
    useReadMessageIds: () => [],
  };
});

afterEach(() => {
  mailboxesPageState.meta = demoMeta;
  mailboxesPageState.metaError = null;
  mailboxesPageState.mailboxes = demoMailboxes;
  mailboxesPageState.mailboxesError = null;
  mailboxesPageState.messages = demoMessages;
  mailboxesPageState.messagesError = null;
  mailboxesPageState.refresh = vi.fn();
  mailboxesPageState.refetchMeta = vi.fn();
});

describe("mailboxes page", () => {
  it("keeps mailbox management available when only message stats fail", () => {
    mailboxesPageState.messages = undefined;
    mailboxesPageState.messagesError = new Error("stats unavailable");

    render(
      <MemoryRouter>
        <MailboxesPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("build@alpha.relay.example.test"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "在工作台查看" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("heading", { name: "邮箱统计暂时同步失败" }),
    ).not.toBeInTheDocument();
  });
});
