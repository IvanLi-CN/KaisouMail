import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PasskeyTable } from "@/components/passkeys/passkey-table";
import { demoPasskeys } from "@/mocks/data";

describe("PasskeyTable", () => {
  it("submits the requested passkey name", async () => {
    const onCreate = vi.fn();

    render(
      <PasskeyTable
        passkeys={demoPasskeys}
        passkeySupported
        onCreate={onCreate}
        onRevoke={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("设备名称"), {
      target: { value: "Work MacBook" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册当前设备" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith("Work MacBook");
    });
  });
});
