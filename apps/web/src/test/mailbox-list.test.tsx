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
    render(
      <MemoryRouter>
        <MailboxList
          mailboxes={[demoMailboxes[2]]}
          messageStatsByMailbox={
            new Map([["mbx_gamma", { unread: 0, total: 0 }]])
          }
          onDestroy={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "销毁邮箱" })).toBeDisabled();
  });
});
