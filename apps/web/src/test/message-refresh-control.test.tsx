import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MessageRefreshControl } from "@/components/messages/message-refresh-control";

describe("MessageRefreshControl", () => {
  it("renders the latest refresh timestamp and triggers manual refresh", () => {
    const onRefresh = vi.fn();

    render(
      <MessageRefreshControl
        isRefreshing={false}
        lastRefreshedAt={new Date("2026-04-04T09:12:00.000Z").getTime()}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByText(/更新于/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "手动刷新" }));
    expect(onRefresh).toHaveBeenCalled();
  }, 10_000);

  it("surfaces refreshing state while an update is in flight", () => {
    render(
      <MessageRefreshControl
        isRefreshing
        lastRefreshedAt={new Date("2026-04-04T09:12:00.000Z").getTime()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("正在刷新…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新中" })).toBeDisabled();
  });
});
