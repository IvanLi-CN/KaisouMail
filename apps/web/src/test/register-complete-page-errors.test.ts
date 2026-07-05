import { describe, expect, it } from "vitest";

import { ApiClientError } from "@/lib/api";
import { toRegisterCompleteSubmitError } from "@/pages/register-complete-page";

describe("register complete page submit errors", () => {
  it("keeps passkey browser errors as passkey form copy", () => {
    expect(
      toRegisterCompleteSubmitError(
        "passkey",
        new Error("NotAllowedError: The operation was cancelled"),
      ),
    ).toEqual({ form: "已取消 passkey 操作" });
  });

  it("keeps passkey api validation details available for field mapping", () => {
    expect(
      toRegisterCompleteSubmitError(
        "passkey",
        new ApiClientError(
          "Invalid request",
          { fieldErrors: { inviteCode: ["Invite required"] } },
          400,
        ),
      ),
    ).toEqual({ fields: { inviteCode: "请输入邀请码。" } });
  });
});
