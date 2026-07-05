import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ApiKeyLoginCard } from "@/components/auth/api-key-login-card";

const renderApiKeyLoginCard = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("ApiKeyLoginCard", () => {
  it("submits the api key payload", async () => {
    const onSubmit = vi.fn();

    renderApiKeyLoginCard(<ApiKeyLoginCard onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "cfm_demo_secret_123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录控制台" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        apiKey: "cfm_demo_secret_123456",
      });
    });
  });

  it("shows feedback immediately after api key submit", async () => {
    let resolveSubmit: () => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    renderApiKeyLoginCard(<ApiKeyLoginCard onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "cfm_demo_secret_123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录控制台" }));

    const button = await screen.findByRole("button", {
      name: "正在验证 API Key…",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("data-auth-state", "loading");
    expect(screen.getByLabelText("API Key")).toBeDisabled();

    resolveSubmit();
  });

  it("ignores rapid repeated api key submit clicks", async () => {
    let resolveSubmit: () => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    renderApiKeyLoginCard(<ApiKeyLoginCard onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "cfm_demo_secret_123456" },
    });

    const button = screen.getByRole("button", { name: "登录控制台" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    resolveSubmit();
  });

  it("shows explicit pending feedback", () => {
    renderApiKeyLoginCard(<ApiKeyLoginCard onSubmit={vi.fn()} isPending />);

    const button = screen.getByRole("button", {
      name: "正在验证 API Key…",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("API Key")).toBeDisabled();
  });
});
