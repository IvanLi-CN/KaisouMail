import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MailboxCreateForm } from "@/components/mailboxes/mailbox-create-form";

describe("MailboxCreateForm", () => {
  it("defaults the root domain to random and omits it from submit payload", async () => {
    const onDomainPreviewChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onDomainPreviewChange={onDomainPreviewChange}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText("邮箱域名")).toHaveValue("");
    expect(onDomainPreviewChange).toHaveBeenLastCalledWith(undefined);

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

    expect(screen.getByLabelText("用户名")).toBeDisabled();
    expect(screen.getByLabelText("子域名")).toBeDisabled();
    expect(screen.getByLabelText("邮箱域名")).toBeDisabled();
    expect(screen.getByLabelText("生命周期（分钟）")).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "创建中…" })).toBeDisabled();
  });

  it("reports the selected root domain back to the parent preview", () => {
    const onDomainPreviewChange = vi.fn();

    render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onDomainPreviewChange={onDomainPreviewChange}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("邮箱域名"), {
      target: { value: "mail.example.net" },
    });

    expect(onDomainPreviewChange).toHaveBeenLastCalledWith("mail.example.net");
  });

  it("falls back to random when the selected domain disappears", () => {
    const onDomainPreviewChange = vi.fn();
    const { rerender } = render(
      <MailboxCreateForm
        defaultTtlMinutes={60}
        domains={["relay.example.test", "mail.example.net"]}
        maxTtlMinutes={1440}
        onDomainPreviewChange={onDomainPreviewChange}
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
        onDomainPreviewChange={onDomainPreviewChange}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("邮箱域名")).toHaveValue("");
    expect(onDomainPreviewChange).toHaveBeenLastCalledWith(undefined);
  });
});
