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
});
