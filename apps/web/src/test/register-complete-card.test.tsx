import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type CompleteRegistrationValues,
  RegisterCompleteCard,
} from "@/components/auth/register-complete-card";
import type { PendingRegistration } from "@/lib/contracts";

const baseRegistration: PendingRegistration = {
  token: "pending_github",
  method: "github",
  sourceIntent: "register",
  redirectTo: "/workspace",
  inviteRequired: false,
  invitePrevalidated: false,
  canComplete: true,
  suggestedNickname: null,
  error: null,
};

const renderRegisterCompleteCard = ({
  registration = baseRegistration,
  onSubmit = vi.fn<(values: CompleteRegistrationValues) => void>(),
}: {
  registration?: PendingRegistration;
  onSubmit?: (values: CompleteRegistrationValues) => Promise<void> | void;
} = {}) =>
  render(
    <MemoryRouter>
      <RegisterCompleteCard registration={registration} onSubmit={onSubmit} />
    </MemoryRouter>,
  );

afterEach(() => {
  vi.clearAllMocks();
});

describe("RegisterCompleteCard", () => {
  it("prefills the nickname once a suggestion arrives before the user edits", async () => {
    const view = renderRegisterCompleteCard();

    const nicknameInput = screen.getByLabelText("昵称");
    expect(nicknameInput).toHaveValue("");

    view.rerender(
      <MemoryRouter>
        <RegisterCompleteCard
          registration={{
            ...baseRegistration,
            suggestedNickname: "Ivan Owner",
          }}
          onSubmit={vi.fn()}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("昵称")).toHaveValue("Ivan Owner");
    });
  });

  it("does not overwrite a nickname that the user already edited", async () => {
    const view = renderRegisterCompleteCard();

    const nicknameInput = screen.getByLabelText("昵称");
    fireEvent.change(nicknameInput, {
      target: { value: "Manual Nickname" },
    });

    view.rerender(
      <MemoryRouter>
        <RegisterCompleteCard
          registration={{
            ...baseRegistration,
            suggestedNickname: "Ivan Owner",
          }}
          onSubmit={vi.fn()}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("昵称")).toHaveValue("Manual Nickname");
    });
  });

  it("submits the user-edited nickname instead of the suggested default", async () => {
    const onSubmit = vi.fn();
    renderRegisterCompleteCard({
      registration: {
        ...baseRegistration,
        suggestedNickname: "Ivan Owner",
      },
      onSubmit,
    });

    const nicknameInput = screen.getByLabelText("昵称");
    fireEvent.change(nicknameInput, {
      target: { value: "Koha" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        nickname: "Koha",
        inviteCode: "",
        passkeyName: "Primary Passkey",
      });
    });
  });
});
