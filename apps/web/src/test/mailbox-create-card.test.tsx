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
    expect(screen.getByLabelText("生命周期值")).toBeEnabled();
  });

  it("keeps helper copy out of the default document flow", () => {
    render(
      <MailboxCreateCard
        onSubmit={vi.fn()}
        domains={["relay.example.test", "mail.example.net"]}
        defaultTtlMinutes={60}
        maxTtlMinutes={1440}
      />,
    );

    expect(screen.queryByText(/默认 .*自动回收/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/有限范围 .* 到 .*支持长期/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/双击编辑；支持 m \/ h \/ d \/ w \/ mo/),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("1 小时").length).toBeGreaterThan(0);
    expect(screen.getByText("6 小时")).toBeInTheDocument();
    expect(screen.getByText("1 天")).toBeInTheDocument();
    expect(screen.queryByText("7 天")).not.toBeInTheDocument();
    expect(screen.getByText("长期")).toBeInTheDocument();
  });

  it("shows only loading state copy when metadata is still loading", () => {
    render(
      <MailboxCreateCard
        onSubmit={vi.fn()}
        domains={["relay.example.test"]}
        defaultTtlMinutes={60}
        maxTtlMinutes={1440}
        isMetaLoading
      />,
    );

    expect(screen.getByText("正在读取邮箱规则…")).toBeInTheDocument();
    expect(screen.queryByText(/默认 .*自动回收/)).not.toBeInTheDocument();
  });
});
