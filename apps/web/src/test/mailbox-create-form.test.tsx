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

    expect(screen.getByRole("button", { name: "分段" })).toHaveAttribute(
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

    expect(screen.getByRole("button", { name: "分段" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "完整" })).toBeDisabled();
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

    fireEvent.click(screen.getByRole("button", { name: "完整" }));
    fireEvent.change(screen.getByLabelText("完整邮箱地址"), {
      target: { value: "Build@Ops.Alpha.unsupported.test" },
    });

    await waitFor(() => {
      expect(onPreviewChange).toHaveBeenLastCalledWith({
        mode: "address",
        rootDomain: undefined,
        address: "build@ops.alpha.unsupported.test",
      });
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

    fireEvent.click(screen.getByRole("button", { name: "完整" }));
    expect(screen.getByLabelText("完整邮箱地址")).toHaveValue(
      "storybox@ops.alpha.mail.example.net",
    );

    fireEvent.click(screen.getByRole("button", { name: "分段" }));
    expect(screen.getByLabelText("用户名")).toHaveValue("storybox");
    expect(screen.getByLabelText("子域名")).toHaveValue("ops.alpha");
    expect(screen.getByLabelText("邮箱域名")).toHaveValue("mail.example.net");
  });

  it("clears stale full-address values when segmented fields no longer resolve", () => {
    render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "完整" }));
    fireEvent.change(screen.getByLabelText("完整邮箱地址"), {
      target: { value: "Build@Ops.Alpha.mail.example.net" },
    });

    fireEvent.click(screen.getByRole("button", { name: "分段" }));
    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "" },
    });

    fireEvent.click(screen.getByRole("button", { name: "完整" }));

    expect(screen.getByLabelText("完整邮箱地址")).toHaveValue("");
  });

  it("suggests switching after a supported full address is pasted into segmented inputs", async () => {
    render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onSubmit={vi.fn()}
      />,
    );

    const localPartField = screen.getByLabelText("用户名");

    fireEvent.paste(localPartField, {
      clipboardData: {
        getData: () => "Build@Ops.Alpha.mail.example.net",
      },
    });
    fireEvent.change(localPartField, {
      target: { value: "Build@Ops.Alpha.mail.example.net" },
    });

    expect(localPartField).toHaveValue("Build@Ops.Alpha.mail.example.net");

    await waitFor(() => {
      expect(
        screen.getByText("检测到这是当前支持的完整邮箱地址："),
      ).toBeInTheDocument();
      expect(
        screen.getByText("build@ops.alpha.mail.example.net"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("切换到完整"));

    expect(screen.getByLabelText("完整邮箱地址")).toHaveValue(
      "build@ops.alpha.mail.example.net",
    );

    fireEvent.click(screen.getByRole("button", { name: "分段" }));
    expect(screen.getByLabelText("用户名")).toHaveValue("build");
    expect(screen.getByLabelText("子域名")).toHaveValue("ops.alpha");
    expect(screen.getByLabelText("邮箱域名")).toHaveValue("mail.example.net");
  });

  it("keeps the pasted value in place when the user dismisses the recommendation", async () => {
    render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onSubmit={vi.fn()}
      />,
    );

    const subdomainField = screen.getByLabelText("子域名");

    fireEvent.paste(subdomainField, {
      clipboardData: {
        getData: () => "Build@Ops.Alpha.mail.example.net",
      },
    });
    fireEvent.change(subdomainField, {
      target: { value: "Build@Ops.Alpha.mail.example.net" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("检测到这是当前支持的完整邮箱地址："),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("继续用分段"));

    expect(
      screen.queryByText("检测到这是当前支持的完整邮箱地址："),
    ).not.toBeInTheDocument();
    expect(subdomainField).toHaveValue("Build@Ops.Alpha.mail.example.net");
  });

  it("does not block submit after paste and falls back to segmented validation", async () => {
    const onSubmit = vi.fn();

    render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onSubmit={onSubmit}
      />,
    );

    const localPartField = screen.getByLabelText("用户名");

    fireEvent.paste(localPartField, {
      clipboardData: {
        getData: () => "Build@Ops.Alpha.mail.example.net",
      },
    });
    fireEvent.change(localPartField, {
      target: { value: "Build@Ops.Alpha.mail.example.net" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("检测到这是当前支持的完整邮箱地址："),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "创建邮箱" }));

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "仅支持小写字母、数字和短横线",
      );
    });

    expect(
      screen.getByText("检测到这是当前支持的完整邮箱地址："),
    ).toBeInTheDocument();
    expect(localPartField).toHaveValue("Build@Ops.Alpha.mail.example.net");
  });
});
