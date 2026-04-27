import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { MailboxList } from "@/components/mailboxes/mailbox-list";
import { demoMailboxes } from "@/mocks/data";

describe("MailboxList", () => {
  it("describes mailboxes without per-address rules as domain managed", () => {
    render(
      <MemoryRouter>
        <MailboxList
          mailboxes={[
            {
              ...demoMailboxes[0],
              id: "mbx_domain_managed",
              address: "kai25@support.fkoai.asia",
              source: "registered",
              routingRuleId: null,
            },
            {
              ...demoMailboxes[2],
              id: "mbx_catch_all_rule",
              address: "ops@wild.mail.example.net",
              source: "catch_all",
              routingRuleId: null,
            },
            {
              ...demoMailboxes[1],
              id: "mbx_single_rule",
              address: "alerts@ops.beta.mail.example.net",
              source: "registered",
              routingRuleId: "rule_beta",
            },
            {
              ...demoMailboxes[3],
              id: "mbx_removed_rule",
              address: "destroyed@history.mail.example.net",
              source: "registered",
              status: "destroyed",
              routingRuleId: null,
            },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Rule: 域名级接管")).toBeInTheDocument();
    expect(screen.getByText("Rule: Catch All")).toBeInTheDocument();
    expect(screen.getByText("Rule: rule_beta")).toBeInTheDocument();
    expect(screen.getByText("Rule: 已移除")).toBeInTheDocument();
    expect(screen.queryByText(/已清理/)).not.toBeInTheDocument();
  });

  it("keeps destroy available for mailboxes that are still destroying", () => {
    render(
      <MemoryRouter>
        <MailboxList
          mailboxes={[
            {
              ...demoMailboxes[0],
              id: "mbx_destroying",
              address: "hold@ops.alpha.relay.example.test",
              status: "destroying",
              routingRuleId: null,
            },
          ]}
          messageStatsByMailbox={
            new Map([["mbx_destroying", { unread: 0, total: 0 }]])
          }
          onDestroy={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "销毁邮箱" })).toBeEnabled();
  });

  it("marks the selected row and renders the existing-mailbox popover", () => {
    const mailbox = demoMailboxes[1];
    if (!mailbox) {
      throw new Error("expected mailbox fixture");
    }

    render(
      <MemoryRouter>
        <MailboxList
          highlightedMailboxId={mailbox.id}
          mailboxes={[mailbox]}
          messageStatsByMailbox={
            new Map([[mailbox.id, { unread: 1, total: 2 }]])
          }
          rowPopover={{
            mailboxId: mailbox.id,
            content: <div>邮箱已存在</div>,
          }}
          selectedMailboxId={mailbox.id}
        />
      </MemoryRouter>,
    );

    const row = screen
      .getByRole("link", { name: mailbox.address })
      .closest("tr");
    expect(row).toHaveAttribute("data-active", "true");
    expect(row).toHaveAttribute("data-highlighted", "true");
    expect(screen.getByText("邮箱已存在")).toBeInTheDocument();
  });

  it("still disables destroy for already destroyed mailboxes", () => {
    const destroyedMailbox = demoMailboxes.find(
      (mailbox) => mailbox.status === "destroyed",
    );
    if (!destroyedMailbox) {
      throw new Error("expected a destroyed mailbox fixture");
    }

    render(
      <MemoryRouter>
        <MailboxList
          mailboxes={[destroyedMailbox]}
          messageStatsByMailbox={
            new Map([[destroyedMailbox.id, { unread: 0, total: 0 }]])
          }
          onDestroy={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "销毁邮箱" })).toBeDisabled();
  });
});
