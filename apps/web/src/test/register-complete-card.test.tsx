import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RegisterCompleteCard } from "@/components/auth/register-complete-card";
import type { PendingRegistration } from "@/lib/contracts";

const githubRegistration: PendingRegistration = {
  token: "pending_github",
  method: "github",
  sourceIntent: "register",
  redirectTo: "/workspace",
  inviteRequired: true,
  invitePrevalidated: false,
  canComplete: true,
  suggestedNickname: "Ivan Owner",
  error: null,
};

const renderRegisterCompleteCard = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("RegisterCompleteCard", () => {
  it("does not reserve blank error rows when the form has no errors", () => {
    renderRegisterCompleteCard(
      <RegisterCompleteCard
        registration={{
          ...githubRegistration,
          inviteRequired: false,
          suggestedNickname: "Ivan Owner",
        }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("昵称")).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("keeps a missing invite error on the invite field", async () => {
    const onSubmit = vi.fn();

    renderRegisterCompleteCard(
      <RegisterCompleteCard
        registration={githubRegistration}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "完成注册并创建账号" }));

    await waitFor(() => {
      expect(screen.getByLabelText("邀请码")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });
    expect(screen.getByText("请输入邀请码。")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders server invite errors below the invite field", async () => {
    renderRegisterCompleteCard(
      <RegisterCompleteCard
        registration={githubRegistration}
        error={{ fields: { inviteCode: "邀请码无效，请检查后重试。" } }}
        onSubmit={vi.fn()}
      />,
    );

    const inviteInput = screen.getByLabelText("邀请码");
    await waitFor(() => {
      expect(inviteInput).toHaveAttribute("aria-invalid", "true");
    });
    expect(inviteInput).toHaveAccessibleDescription(
      "邀请码无效，请检查后重试。",
    );
  });
});
