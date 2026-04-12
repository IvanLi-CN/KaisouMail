import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { MailboxList } from "@/components/mailboxes/mailbox-list";
import { demoMailboxes } from "@/mocks/data";

describe("MailboxList", () => {
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
