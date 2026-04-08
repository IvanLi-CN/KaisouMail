import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MailboxCreateCard } from "@/components/mailboxes/mailbox-create-card";

describe("MailboxCreateCard", () => {
  it("keeps the form usable while showing an explicit meta error", () => {
    render(
      <MailboxCreateCard
        onSubmit={vi.fn()}
        defaultTtlMinutes={60}
        maxTtlMinutes={1440}
        metaError="Failed to load mailbox rules"
      />,
    );

    expect(
      screen.getByText(/邮箱规则加载失败：Failed to load mailbox rules/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建邮箱" })).toBeEnabled();
    expect(screen.getByLabelText("用户名")).toBeEnabled();
    expect(screen.getByLabelText("子域名")).toBeEnabled();
    expect(screen.getByLabelText("生命周期（分钟）")).toBeEnabled();
  });

  it("switches preview copy when full-address mode is selected", () => {
    render(
      <MailboxCreateCard
        onSubmit={vi.fn()}
        domains={["relay.example.test", "mail.example.net"]}
        defaultTtlMinutes={60}
        maxTtlMinutes={1440}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "完整邮箱地址" }));

    expect(
      screen.getByText(/支持直接输入完整邮箱地址，并校验是否属于当前支持域名/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/只有当前支持域名下的地址才可提交/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ava-lin@desk.hub.<当前支持的完整邮箱地址>"),
    ).toBeInTheDocument();
  });

  it("does not promise random allocation when no active domains are available", () => {
    render(
      <MailboxCreateCard
        onSubmit={vi.fn()}
        domains={[]}
        defaultTtlMinutes={60}
        maxTtlMinutes={1440}
      />,
    );

    expect(
      screen.getByText(
        /当前没有 active 邮箱域名可供分配；启用域名后才能创建邮箱。/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ava-lin@desk.hub.<启用后可用的域名>"),
    ).toBeInTheDocument();
  });
});
