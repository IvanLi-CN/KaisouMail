import { render, screen } from "@testing-library/react";
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
      screen.getByText("nightly@ops.alpha.<启用后可用的域名>"),
    ).toBeInTheDocument();
  });
});
