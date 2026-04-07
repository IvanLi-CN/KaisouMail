import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { demoMailboxes } from "@/mocks/data";
import { MailboxDetailPage } from "@/pages/mailbox-detail-page";

const detailMailboxState = {
  mailbox: {
    ...demoMailboxes[0],
    status: "destroying" as const,
    routingRuleId: null,
  },
  mutate: vi.fn(),
};

vi.mock("@/hooks/use-mailboxes", () => ({
  mailboxKeys: {
    detail: (mailboxId: string) => ["mailboxes", mailboxId],
  },
  useMailboxDetailQuery: () => ({
    data: detailMailboxState.mailbox,
    dataUpdatedAt: 1_713_526_800_000,
    isFetching: false,
  }),
  useDestroyMailboxMutation: () => ({
    mutate: detailMailboxState.mutate,
  }),
}));

vi.mock("@/hooks/use-messages", () => ({
  messageKeys: {
    all: ["messages"],
  },
  useMessagesQuery: () => ({
    data: [],
    dataUpdatedAt: 1_713_526_800_000,
    isFetching: false,
  }),
}));

vi.mock("@/hooks/use-query-refresh", () => ({
  useQueryRefresh: () => ({
    refresh: vi.fn(),
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

describe("MailboxDetailPage", () => {
  it("lets users destroy a mailbox that is still destroying", () => {
    render(
      <MemoryRouter initialEntries={["/mailboxes/mbx_alpha"]}>
        <Routes>
          <Route path="/mailboxes/:mailboxId" element={<MailboxDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getAllByRole("button", { name: "销毁邮箱" })[0],
    ).toBeEnabled();
  });
});
