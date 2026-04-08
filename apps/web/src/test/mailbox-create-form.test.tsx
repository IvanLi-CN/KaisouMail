import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MailboxCreateForm } from "@/components/mailboxes/mailbox-create-form";

describe("MailboxCreateForm", () => {
  it("defaults to segmented mode and omits the random root domain from submit payload", async () => {
    const onPreviewChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onPreviewChange={onPreviewChange}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole("button", { name: "分段输入" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("邮箱域名")).toHaveValue("");
    expect(onPreviewChange).toHaveBeenLastCalledWith({
      mode: "segmented",
      rootDomain: undefined,
    });

    fireEvent.change(screen.getByLabelText("生命周期（分钟）"), {
      target: { value: "60" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建邮箱" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        expiresInMinutes: 60,
      });
    });
  });

  it("disables the full form while a create request is pending", () => {
    render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test"]}
        isPending
        maxTtlMinutes={1440}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "分段输入" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "完整邮箱地址" })).toBeDisabled();
    expect(screen.getByLabelText("用户名")).toBeDisabled();
    expect(screen.getByLabelText("子域名")).toBeDisabled();
    expect(screen.getByLabelText("邮箱域名")).toBeDisabled();
    expect(screen.getByLabelText("生命周期（分钟）")).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "创建中…" })).toBeDisabled();
  });

  it("reports segmented preview changes when the selected root domain changes", async () => {
    const onPreviewChange = vi.fn();

    render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onPreviewChange={onPreviewChange}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "mail.example.net" },
    });

    await waitFor(() => {
      expect(onPreviewChange).toHaveBeenLastCalledWith({
        mode: "segmented",
        rootDomain: "mail.example.net",
      });
    });
  });

  it("falls back to random when the selected domain disappears", () => {
    const onPreviewChange = vi.fn();
    const { rerender } = render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onPreviewChange={onPreviewChange}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "mail.example.net" },
    });
    expect(screen.getByLabelText("邮箱域名")).toHaveValue("mail.example.net");

    rerender(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test"]}
        maxTtlMinutes={1440}
        onPreviewChange={onPreviewChange}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("邮箱域名")).toHaveValue("");
    expect(onPreviewChange).toHaveBeenLastCalledWith({
      mode: "segmented",
      rootDomain: undefined,
    });
  });

  it("switches to full-address mode, validates supported domains, and submits normalized values", async () => {
    const onPreviewChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onPreviewChange={onPreviewChange}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "完整邮箱地址" }));
    fireEvent.change(screen.getByLabelText("完整邮箱地址"), {
      target: { value: "Build@Ops.Alpha.unsupported.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建邮箱" }));

    await waitFor(() => {
      expect(
        screen.getByRole("alert", {
          name: "",
        }),
      ).toHaveTextContent("请输入当前支持域名下的完整邮箱地址");
    });

    fireEvent.change(screen.getByLabelText("完整邮箱地址"), {
      target: { value: "Build@Ops.Alpha.mail.example.net" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建邮箱" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        localPart: "build",
        subdomain: "ops.alpha",
        rootDomain: "mail.example.net",
        expiresInMinutes: 60,
      });
    });
    expect(onPreviewChange).toHaveBeenLastCalledWith({
      mode: "address",
      rootDomain: "mail.example.net",
      address: "build@ops.alpha.mail.example.net",
    });
  });

  it("auto-fills between segmented mode and full-address mode when switching", () => {
    render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "Storybox" },
    });
    fireEvent.change(screen.getByLabelText("子域名"), {
      target: { value: "Ops.Alpha" },
    });
    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "mail.example.net" },
    });

    fireEvent.click(screen.getByRole("button", { name: "完整邮箱地址" }));
    expect(screen.getByLabelText("完整邮箱地址")).toHaveValue(
      "storybox@ops.alpha.mail.example.net",
    );

    fireEvent.click(screen.getByRole("button", { name: "分段输入" }));
    expect(screen.getByLabelText("用户名")).toHaveValue("storybox");
    expect(screen.getByLabelText("子域名")).toHaveValue("ops.alpha");
    expect(screen.getByLabelText("邮箱域名")).toHaveValue("mail.example.net");
  });

  it("suggests switching when a supported full address is pasted into segmented inputs", () => {
    render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.paste(screen.getByLabelText("用户名"), {
      clipboardData: {
        getData: () => "Build@Ops.Alpha.mail.example.net",
      },
    });

    expect(
      screen.getByText("检测到这是当前支持的完整邮箱地址："),
    ).toBeInTheDocument();
    expect(
      screen.getByText("build@ops.alpha.mail.example.net"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "切换到完整邮箱地址输入" }),
    );

    expect(screen.getByLabelText("完整邮箱地址")).toHaveValue(
      "build@ops.alpha.mail.example.net",
    );

    fireEvent.click(screen.getByRole("button", { name: "分段输入" }));
    expect(screen.getByLabelText("用户名")).toHaveValue("build");
    expect(screen.getByLabelText("子域名")).toHaveValue("ops.alpha");
    expect(screen.getByLabelText("邮箱域名")).toHaveValue("mail.example.net");
  });

  it("restores the original paste when the user keeps segmented input", () => {
    render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.paste(screen.getByLabelText("子域名"), {
      clipboardData: {
        getData: () => "Build@Ops.Alpha.mail.example.net",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "保留当前粘贴" }));

    expect(
      screen.queryByText("检测到这是当前支持的完整邮箱地址："),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("子域名")).toHaveValue(
      "Build@Ops.Alpha.mail.example.net",
    );
  });

  it("blocks submit until the pasted full-address suggestion is resolved", async () => {
    const onSubmit = vi.fn();

    render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.paste(screen.getByLabelText("用户名"), {
      clipboardData: {
        getData: () => "Build@Ops.Alpha.mail.example.net",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "创建邮箱" }));

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "检测到完整邮箱地址，请先选择切换输入方式，或保留这次原始粘贴",
      );
    });

    expect(
      screen.getByText("检测到这是当前支持的完整邮箱地址："),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("用户名")).toHaveValue("");
  });
});
