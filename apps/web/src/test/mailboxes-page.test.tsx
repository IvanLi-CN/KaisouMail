import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { demoMailboxes, demoMeta } from "@/mocks/data";
import { MailboxesPageView } from "@/pages/mailboxes-page";

describe("mailboxes page view", () => {
  it("renders server-provided mailbox metadata in the create card", () => {
    render(
      <MemoryRouter>
        <MailboxesPageView
          meta={demoMeta}
          mailboxes={demoMailboxes}
          messageStatsByMailbox={
            new Map(
              demoMailboxes.map((mailbox) => [
                mailbox.id,
                {
                  unread: 0,
                  total: 0,
                },
              ]),
            )
          }
          onCreate={vi.fn()}
          onDestroy={vi.fn()}
        />
      </MemoryRouter>,
    );

    const rootDomainField = screen.getByLabelText(
      "邮箱域名",
    ) as HTMLSelectElement;
    expect(["707979.xyz", "mail.example.net"]).toContain(rootDomainField.value);
    expect(
      screen.getByText(
        new RegExp(
          `nightly@ops\\.alpha\\.${rootDomainField.value.replace(/\./g, "\\.")}`,
          "i",
        ),
      ),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("60")).toBeInTheDocument();
  });
});
