import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/lib/api";
import { demoMailboxes, demoMessages, demoMeta } from "@/mocks/data";
import { MailboxesPage } from "@/pages/mailboxes-page";

const mailboxesPageState: {
  meta: typeof demoMeta | undefined;
  metaError: Error | null;
  mailboxes: typeof demoMailboxes | undefined;
  mailboxesError: Error | null;
  messages: typeof demoMessages | undefined;
  messagesError: Error | null;
  createMailbox: ReturnType<typeof vi.fn>;
  ensureMailbox: ReturnType<typeof vi.fn>;
  destroyMailbox: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  refetchMeta: ReturnType<typeof vi.fn>;
} = {
  meta: demoMeta,
  metaError: null,
  mailboxes: demoMailboxes,
  mailboxesError: null,
  messages: demoMessages,
  messagesError: null,
  createMailbox: vi.fn(),
  ensureMailbox: vi.fn(),
  destroyMailbox: vi.fn(),
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
    mutateAsync: mailboxesPageState.createMailbox,
  }),
  useEnsureMailboxMutation: () => ({
    isPending: false,
    mutateAsync: mailboxesPageState.ensureMailbox,
  }),
  useDestroyMailboxMutation: () => ({
    mutate: mailboxesPageState.destroyMailbox,
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
  mailboxesPageState.createMailbox = vi.fn();
  mailboxesPageState.ensureMailbox = vi.fn();
  mailboxesPageState.destroyMailbox = vi.fn();
  mailboxesPageState.refresh = vi.fn();
  mailboxesPageState.refetchMeta = vi.fn();
});

describe("mailboxes page", () => {
  it("does not mark any mailbox row as active on initial load", () => {
    render(
      <MemoryRouter>
        <MailboxesPage />
      </MemoryRouter>,
    );

    const firstRow = screen
      .getByRole("link", { name: demoMailboxes[0]?.address })
      .closest("tr");

    expect(firstRow).not.toHaveAttribute("data-active");
    expect(firstRow).not.toHaveAttribute("data-highlighted");
  });

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

  it("selects the existing mailbox and shows the extension prompt on create conflict", async () => {
    const existingMailbox = demoMailboxes[1];
    if (!existingMailbox) {
      throw new Error("expected mailbox fixture");
    }

    mailboxesPageState.createMailbox.mockRejectedValue(
      new ApiClientError(
        "Mailbox already exists",
        {
          code: "mailbox_exists",
          mailbox: existingMailbox,
        },
        409,
      ),
    );
    mailboxesPageState.ensureMailbox.mockResolvedValue({
      ...existingMailbox,
      expiresAt: "2026-04-18T14:15:00.000Z",
    });

    render(
      <MemoryRouter>
        <MailboxesPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: existingMailbox.localPart },
    });
    fireEvent.change(screen.getByLabelText("子域名"), {
      target: { value: existingMailbox.subdomain },
    });
    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: existingMailbox.rootDomain },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建邮箱" }));

    await waitFor(() => {
      expect(screen.getByText("邮箱已存在")).toBeInTheDocument();
    });

    const existingRow = screen
      .getByRole("link", { name: existingMailbox.address })
      .closest("tr");
    expect(existingRow).toHaveAttribute("data-active", "true");
    expect(existingRow).toHaveAttribute("data-highlighted", "true");

    expect(mailboxesPageState.ensureMailbox).not.toHaveBeenCalled();
    expect(screen.getAllByText(existingMailbox.address).length).toBeGreaterThan(
      0,
    );

    fireEvent.click(screen.getByText("暂不处理"));

    await waitFor(() => {
      expect(screen.queryByText("邮箱已存在")).not.toBeInTheDocument();
    });
    expect(existingRow).not.toHaveAttribute("data-active");
    expect(existingRow).not.toHaveAttribute("data-highlighted");
  });
});
