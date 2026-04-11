import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

const buildMailboxLatestVerificationCodes = () => {
  const latestByMailboxId = new Map<
    string,
    { code: string; receivedAt: string }
  >();

  for (const message of demoMessages) {
    const code = message.verification?.code;
    if (!code) continue;

    const current = latestByMailboxId.get(message.mailboxId);
    if (!current || message.receivedAt.localeCompare(current.receivedAt) > 0) {
      latestByMailboxId.set(message.mailboxId, {
        code,
        receivedAt: message.receivedAt,
      });
    }
  }

  return new Map(
    [...latestByMailboxId.entries()].map(([mailboxId, value]) => [
      mailboxId,
      value.code,
    ]),
  );
};

const baseProps = {
  createMailboxAction: {
    defaultTtlMinutes: demoMeta.defaultMailboxTtlMinutes,
    domains: demoMeta.domains,
    error: null,
    isMetaLoading: false,
    isOpen: true,
    isPending: false,
    minTtlMinutes: demoMeta.minMailboxTtlMinutes,
    maxTtlMinutes: demoMeta.maxMailboxTtlMinutes,
    metaError: null,
    onCancel: vi.fn(),
    onOpen: vi.fn(),
    onSubmit: vi.fn(),
    supportsUnlimitedTtl: demoMeta.supportsUnlimitedMailboxTtl,
  },
  highlightedMailboxId: null,
  visibleMailboxes: demoMailboxes,
  totalMailboxCount: demoMailboxes.length,
  totalMessageCount: demoMessages.length,
  totalAggregatedMessageCount: demoMessages.length,
  mailboxMessageCounts: buildMailboxMessageCounts(),
  mailboxLatestVerificationCodes: buildMailboxLatestVerificationCodes(),
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

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
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
      screen.getByRole("button", { name: "查看邮箱创建说明" }),
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
    expect(within(mailboxList).getByText("新建")).toBeInTheDocument();
  });

  it("uses semantic state hooks instead of stacked ring utilities across workspace rails", () => {
    render(
      <MemoryRouter>
        <MailWorkspace
          {...baseProps}
          highlightedMailboxId="mbx_beta"
          selectedMailboxId="all"
          createMailboxAction={{
            ...baseProps.createMailboxAction,
            isOpen: false,
          }}
        />
      </MemoryRouter>,
    );

    const mailboxList = screen.getByRole("region", { name: "邮箱列表" });
    const allMailRow = within(mailboxList).getByRole("button", {
      name: /全部邮箱/i,
    });
    const normalRow = within(mailboxList).getByRole("button", {
      name: /build@alpha\.relay\.example\.test/i,
    });
    const highlightedRow = within(mailboxList).getByRole("button", {
      name: /spec@ops\.beta\.mail\.example\.net/i,
    });
    const messageList = screen.getByRole("region", { name: "邮件列表" });
    const activeMessageRow = within(messageList).getByRole("button", {
      name: /Build artifacts ready/i,
    });
    const normalRowShell = normalRow.closest(".workspace-mailbox-item");
    const highlightedRowShell = highlightedRow.closest(
      ".workspace-mailbox-item",
    );
    const activeMessageRowShell = activeMessageRow.closest(
      ".workspace-message-item",
    );

    expect(allMailRow).toHaveClass("workspace-mailbox-item");
    expect(allMailRow).toHaveAttribute("data-active", "true");
    expect(allMailRow.className).not.toContain("focus-visible:ring-ring");
    expect(allMailRow.className).not.toContain("focus-visible:ring-2");

    expect(normalRowShell).not.toBeNull();
    expect(normalRowShell).not.toHaveAttribute("data-active");
    expect(normalRowShell).not.toHaveAttribute("data-highlighted");

    expect(highlightedRowShell).not.toBeNull();
    expect(highlightedRowShell).toHaveAttribute("data-highlighted", "true");
    expect(highlightedRowShell?.className).not.toContain("ring-1");
    expect(highlightedRowShell?.className).not.toContain("ring-primary/35");

    expect(activeMessageRowShell).not.toBeNull();
    expect(activeMessageRowShell).toHaveAttribute("data-active", "true");
    expect(activeMessageRowShell?.className).not.toContain(
      "focus-visible:ring-ring",
    );
    expect(activeMessageRowShell?.className).not.toContain(
      "focus-visible:ring-2",
    );

    highlightedRow.focus();
    expect(highlightedRow).toHaveFocus();
  });

  it("copies the verification code without changing the selected mailbox or message", async () => {
    const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteText,
      },
    });
    const onSelectMailbox = vi.fn();
    const onSelectMessage = vi.fn();

    render(
      <MemoryRouter>
        <MailWorkspace
          {...baseProps}
          createMailboxAction={{
            ...baseProps.createMailboxAction,
            isOpen: false,
          }}
          onSelectMailbox={onSelectMailbox}
          onSelectMessage={onSelectMessage}
        />
      </MemoryRouter>,
    );

    const verificationCopyButtons = screen.getAllByRole("button", {
      name: "复制验证码 842911",
    });
    fireEvent.click(verificationCopyButtons[0] as HTMLElement);
    expect(verificationCopyButtons[1]).toBeDefined();
    fireEvent.click(verificationCopyButtons[1] as HTMLElement);

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledTimes(2);
    });
    expect(clipboardWriteText).toHaveBeenNthCalledWith(1, "842911");
    expect(clipboardWriteText).toHaveBeenNthCalledWith(2, "842911");
    expect(onSelectMailbox).not.toHaveBeenCalled();
    expect(onSelectMessage).not.toHaveBeenCalled();
    expect(verificationCopyButtons[0]).toHaveTextContent("842911");
    expect(
      screen.getAllByRole("button", { name: "已复制验证码 842911" }),
    ).toHaveLength(2);
    expect(screen.getAllByText("已复制").length).toBeGreaterThan(0);
    expect(screen.queryByText("点击复制")).not.toBeInTheDocument();
    expect(screen.queryByText("验证码")).not.toBeInTheDocument();
  });

  it("copies a mailbox address from the left rail without selecting the row", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onSelectMailbox = vi.fn();

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    render(
      <MemoryRouter>
        <MailWorkspace
          {...baseProps}
          createMailboxAction={{
            ...baseProps.createMailboxAction,
            isOpen: false,
          }}
          onSelectMailbox={onSelectMailbox}
        />
      </MemoryRouter>,
    );

    const mailboxList = screen.getByRole("region", { name: "邮箱列表" });
    fireEvent.click(
      within(
        screen
          .getByTitle("build@alpha.relay.example.test")
          .closest(".relative") as HTMLElement,
      ).getByRole("button", { name: "复制邮箱地址" }),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("build@alpha.relay.example.test");
    });
    expect(onSelectMailbox).not.toHaveBeenCalled();
    expect(
      within(mailboxList).getByRole("button", { name: "已复制邮箱地址" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("已复制").length).toBeGreaterThan(0);
  });

  it("copies the selected mailbox address and shows success feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    render(
      <MemoryRouter>
        <MailWorkspace
          {...baseProps}
          createMailboxAction={{
            ...baseProps.createMailboxAction,
            isOpen: false,
          }}
          selectedMailboxId="mbx_alpha"
          selectedMailbox={demoMailboxes[0] ?? null}
          messages={demoMessages.filter(
            (message) => message.mailboxId === "mbx_alpha",
          )}
          selectedMessageId="msg_alpha"
          selectedMessage={demoMessageDetails.msg_alpha}
        />
      </MemoryRouter>,
    );

    const addressText = screen.getByTestId(
      "workspace-selected-mailbox-address",
    );
    expect(addressText).toHaveTextContent("build@alpha.relay.example.test");

    fireEvent.click(screen.getByRole("button", { name: "复制当前邮箱地址" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("build@alpha.relay.example.test");
    });
    expect(
      screen.getByRole("button", { name: "已复制当前邮箱地址" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("已复制").length).toBeGreaterThan(0);
    expect(screen.queryByText("邮箱地址已复制")).not.toBeInTheDocument();
  });

  it("keeps mailbox and message rows clickable across the full card shell", () => {
    const onSelectMailbox = vi.fn();
    const onSelectMessage = vi.fn();

    render(
      <MemoryRouter>
        <MailWorkspace
          {...baseProps}
          createMailboxAction={{
            ...baseProps.createMailboxAction,
            isOpen: false,
          }}
          onSelectMailbox={onSelectMailbox}
          onSelectMessage={onSelectMessage}
        />
      </MemoryRouter>,
    );

    const mailboxShell = within(
      screen.getByRole("region", { name: "邮箱列表" }),
    )
      .getByRole("button", { name: /build@alpha\.relay\.example\.test/i })
      .closest(".workspace-mailbox-item");
    const messageShell = within(
      screen.getByRole("region", { name: "邮件列表" }),
    )
      .getByRole("button", { name: /Build artifacts ready/i })
      .closest(".workspace-message-item");

    expect(mailboxShell).not.toBeNull();
    expect(messageShell).not.toBeNull();

    fireEvent.click(mailboxShell as HTMLElement);
    fireEvent.click(messageShell as HTMLElement);

    expect(onSelectMailbox).toHaveBeenCalledWith("mbx_alpha");
    expect(onSelectMessage).toHaveBeenCalledWith("msg_alpha");
  });

  it("renders pane-specific errors instead of empty placeholders", () => {
    render(
      <MemoryRouter>
        <MailWorkspace
          {...baseProps}
          mailboxesError={{
            variant: "recoverable",
            title: "邮箱列表暂时不可用",
            description: "暂时无法获取邮箱目录和统计，请刷新后重试。",
            details: '{"error":"Request failed"}',
            onRetry: vi.fn(),
          }}
          messagesError={{
            variant: "recoverable",
            title: "邮件流加载失败",
            description: "暂时无法获取当前范围内的邮件，请刷新后重试。",
            details: '{"error":"Request failed"}',
            onRetry: vi.fn(),
          }}
          messageError={{
            variant: "not-found",
            title: "这封邮件已经不可见了",
            description: "请重新选择中栏里的其他邮件继续查看。",
            details: '{"error":"Message not found"}',
            onRetry: vi.fn(),
          }}
          visibleMailboxes={[]}
          messages={[]}
          selectedMessage={null}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "邮箱列表暂时不可用" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "邮件流加载失败" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "这封邮件已经不可见了" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("没有匹配邮箱")).not.toBeInTheDocument();
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
          mailboxLatestVerificationCodes={new Map()}
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

  it("submits normalized full addresses from the create popover", () => {
    const onSubmit = vi.fn();

    render(
      <MemoryRouter>
        <MailWorkspace
          {...baseProps}
          createMailboxAction={{
            ...baseProps.createMailboxAction,
            onSubmit,
          }}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "完整" }));
    fireEvent.change(screen.getByLabelText("完整邮箱地址"), {
      target: { value: "Build@Ops.Alpha.mail.example.net" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建邮箱" }));

    return waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        localPart: "build",
        subdomain: "ops.alpha",
        rootDomain: "mail.example.net",
        expiresInMinutes: demoMeta.defaultMailboxTtlMinutes,
      });
    });
  });
});
