import { fireEvent, render, screen } from "@testing-library/react";
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

  it("uses a searchable tag filter selector without browser autocomplete", () => {
    const onTagFilterChange = vi.fn();

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
          onTagFilterChange={onTagFilterChange}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText("按 Tag 筛选"));

    const searchInput = screen.getByLabelText("搜索 Tag");
    expect(searchInput).toHaveAttribute("autocomplete", "off");
    expect(searchInput).toHaveAttribute(
      "name",
      "mailbox-tag-filter-search-token",
    );
    expect(searchInput).toHaveAttribute("data-1p-ignore", "true");
    expect(searchInput).toHaveAttribute("data-bwignore", "true");
    expect(searchInput).toHaveAttribute("data-lpignore", "true");

    fireEvent.change(searchInput, { target: { value: "op" } });
    fireEvent.click(screen.getByRole("option", { name: "筛选 Tag ops" }));

    expect(onTagFilterChange).toHaveBeenCalledWith("ops");
  });

  it("keeps create tag suggestions independent from the active list tag filter", () => {
    const authOnlyMailboxes = demoMailboxes.filter((mailbox) =>
      mailbox.tags.includes("auth"),
    );

    render(
      <MemoryRouter>
        <MailboxesPageView
          meta={demoMeta}
          mailboxes={authOnlyMailboxes}
          tagFilter="auth"
          tagSuggestionMailboxes={demoMailboxes}
          messageStatsByMailbox={
            new Map(
              authOnlyMailboxes.map((mailbox) => [
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

    fireEvent.focus(screen.getByLabelText("Tags"));

    expect(
      screen.getByRole("option", { name: "添加 Tag ops" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "添加 Tag build" }),
    ).toBeInTheDocument();
  });
});
