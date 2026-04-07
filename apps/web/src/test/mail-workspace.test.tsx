import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

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
    expect(
      within(mailboxList).getByRole("button", {
        name: /spec@ops\.beta\.mail\.example\.net/i,
      }),
    ).toHaveTextContent("新建");
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
});
