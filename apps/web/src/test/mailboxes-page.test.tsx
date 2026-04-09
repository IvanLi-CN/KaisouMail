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
    expect(rootDomainField.value).toBe("");
    expect(screen.getByLabelText("生命周期值")).toHaveTextContent("1 小时");
    expect(screen.queryByText(/默认 .*自动回收/)).not.toBeInTheDocument();
  });

  it("shows a list error instead of pretending there are no mailboxes", () => {
    render(
      <MemoryRouter>
        <MailboxesPageView
          meta={demoMeta}
          listError={{
            variant: "recoverable",
            title: "邮箱列表加载失败",
            description: "当前邮箱存续数据不可用。",
            details: '{"error":"Request failed"}',
          }}
          mailboxes={[]}
          messageStatsByMailbox={new Map()}
          onRetryList={vi.fn()}
          onCreate={vi.fn()}
          onDestroy={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "邮箱列表加载失败" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新加载邮箱列表" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("暂无邮箱")).not.toBeInTheDocument();
  });
});
