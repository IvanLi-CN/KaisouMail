import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { demoUsers } from "@/mocks/data";
import { UsersPageView } from "@/pages/users-page";

describe("users page view", () => {
  it("renders a recoverable error state", () => {
    render(
      <MemoryRouter>
        <UsersPageView
          users={[]}
          latestKey={null}
          error={{
            variant: "recoverable",
            title: "用户目录加载失败",
            description: "多用户列表现在不可用。",
            details: '{"error":"Request failed"}',
          }}
          onRetry={vi.fn()}
          onCreate={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "用户目录加载失败" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新加载用户列表" }),
    ).toBeInTheDocument();
  });

  it("renders the table when data is available", () => {
    render(
      <MemoryRouter>
        <UsersPageView users={demoUsers} latestKey={null} onCreate={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("teammate@example.com")).toBeInTheDocument();
  });
});
