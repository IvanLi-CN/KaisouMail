import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MailWorkspace } from "@/components/workspace/mail-workspace";
import {
  demoMailboxes,
  demoMessageDetails,
  demoMessages,
  demoMeta,
} from "@/mocks/data";

const buildMailboxMessageCounts = () =>
  new Map(
    demoMailboxes.map((mailbox) => [
      mailbox.id,
      demoMessages.filter((message) => message.mailboxId === mailbox.id).length,
    ]),
  );

const baseProps = {
  createMailboxAction: {
    defaultTtlMinutes: demoMeta.defaultMailboxTtlMinutes,
    domains: demoMeta.domains,
    error: null,
    isMetaLoading: false,
    isOpen: true,
    isPending: false,
    maxTtlMinutes: demoMeta.maxMailboxTtlMinutes,
    metaError: null,
    onCancel: vi.fn(),
    onOpen: vi.fn(),
    onSubmit: vi.fn(),
  },
  highlightedMailboxId: null,
  visibleMailboxes: demoMailboxes,
  totalMailboxCount: demoMailboxes.length,
  totalMessageCount: demoMessages.length,
  totalAggregatedMessageCount: demoMessages.length,
  mailboxMessageCounts: buildMailboxMessageCounts(),
  selectedMailboxId: "all",
  selectedMailbox: null,
  messages: demoMessages,
  selectedMessageId: demoMessages[0]?.id ?? null,
  selectedMessage: demoMessageDetails.msg_alpha,
  searchQuery: "",
  sortMode: "recent" as const,
  mailboxManagementHref: "/mailboxes",
  messageDetailHref:
    "/messages/msg_alpha?mailbox=all&message=msg_alpha&sort=recent",
  onSearchQueryChange: vi.fn(),
  onSortModeChange: vi.fn(),
  onSelectMailbox: vi.fn(),
  onSelectMessage: vi.fn(),
};

const stubDesktopMatchMedia = () => {
  const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("min-width: 1280px"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  vi.stubGlobal("matchMedia", matchMediaMock);

  return matchMediaMock;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MailWorkspace", () => {
  it("only closes the create popover via cancel or escape when idle", () => {
    const onCancel = vi.fn();

    render(
      <MemoryRouter>
        <MailWorkspace
          {...baseProps}
          createMailboxAction={{
            ...baseProps.createMailboxAction,
            onCancel,
          }}
        />
      </MemoryRouter>,
    );

    fireEvent.pointerDown(document.body);
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByLabelText("邮箱域名")).toHaveValue("");
    expect(
      screen.getByText(/nightly@ops\.alpha\.<随机 active 域名>/i),
    ).toBeInTheDocument();

    fireEvent.keyDown(screen.getByLabelText("用户名"), {
      key: "Escape",
    });
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("locks the popover while create is pending and marks highlighted rows", () => {
    const onCancel = vi.fn();

    render(
      <MemoryRouter>
        <MailWorkspace
          {...baseProps}
          highlightedMailboxId="mbx_beta"
          createMailboxAction={{
            ...baseProps.createMailboxAction,
            isPending: true,
            onCancel,
          }}
        />
      </MemoryRouter>,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "创建中…" }), {
      key: "Escape",
    });

    const mailboxList = screen.getByRole("region", { name: "邮箱列表" });

    expect(onCancel).not.toHaveBeenCalled();
    expect(
      within(mailboxList).getByRole("button", {
        name: /spec@ops\.beta\.mail\.example\.net/i,
      }),
    ).toHaveTextContent("新建");
  });

  it("uses internal desktop scroll containers for long lists on xl layouts", () => {
    stubDesktopMatchMedia();

    const longMailboxes = Array.from({ length: 140 }, (_, index) => ({
      ...demoMailboxes[0],
      id: `mbx_virtual_${index}`,
      address: `mailbox-${index.toString().padStart(3, "0")}@ops.alpha.relay.example.test`,
      createdAt: `2026-04-01T08:${(index % 60).toString().padStart(2, "0")}:00.000Z`,
      lastReceivedAt: `2026-04-01T09:${(index % 60).toString().padStart(2, "0")}:00.000Z`,
    }));
    const longMessages = Array.from({ length: 220 }, (_, index) => ({
      ...demoMessages[0],
      id: `msg_virtual_${index}`,
      mailboxId: longMailboxes[96]?.id ?? demoMailboxes[0].id,
      mailboxAddress:
        longMailboxes[96]?.address ?? demoMailboxes[0]?.address ?? "",
      subject: `Virtualized message ${index.toString().padStart(3, "0")}`,
      previewText: `Preview ${index}`,
      receivedAt: `2026-04-01T10:${(index % 60).toString().padStart(2, "0")}:00.000Z`,
    }));

    render(
      <MemoryRouter>
        <MailWorkspace
          {...baseProps}
          createMailboxAction={{
            ...baseProps.createMailboxAction,
            isOpen: false,
          }}
          highlightedMailboxId={null}
          visibleMailboxes={longMailboxes}
          totalMailboxCount={longMailboxes.length}
          totalMessageCount={longMessages.length}
          totalAggregatedMessageCount={longMessages.length}
          mailboxMessageCounts={
            new Map(longMailboxes.map((mailbox) => [mailbox.id, 1]))
          }
          selectedMailboxId="all"
          selectedMailbox={null}
          messages={longMessages}
          selectedMessageId={null}
          selectedMessage={null}
        />
      </MemoryRouter>,
    );

    const mailboxScroll = screen.getByTestId("workspace-mailbox-scroll");
    const messageScroll = screen.getByTestId("workspace-message-scroll");
    const mailboxVirtualizedList = mailboxScroll.firstElementChild
      ?.firstElementChild as HTMLElement | null;
    const messageVirtualizedList = messageScroll.firstElementChild
      ?.firstElementChild as HTMLElement | null;

    expect(mailboxScroll).toHaveClass("workspace-scrollbar__scroller");
    expect(messageScroll).toHaveClass("workspace-scrollbar__scroller");
    expect(mailboxScroll.closest(".workspace-scrollbar")).not.toBeNull();
    expect(messageScroll.closest(".workspace-scrollbar")).not.toBeNull();
    expect(mailboxVirtualizedList).toHaveClass("relative", "w-full");
    expect(messageVirtualizedList).toHaveClass("relative", "w-full");
    expect(mailboxVirtualizedList).toHaveAttribute(
      "style",
      expect.stringContaining("height: 12320px;"),
    );
    expect(messageVirtualizedList).toHaveAttribute(
      "style",
      expect.stringContaining("height: 22880px;"),
    );
  });
});
