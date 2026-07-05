import { describe, expect, it } from "vitest";

import { ApiClientError } from "@/lib/api";
import {
  getRegistrationCompletionError,
  getRegistrationStatusMessage,
} from "@/lib/registration-errors";

describe("registration error mapping", () => {
  it("maps missing invite copy to the invite field", () => {
    expect(
      getRegistrationCompletionError(
        new ApiClientError("Invite required", null, 403),
      ),
    ).toEqual({ fields: { inviteCode: "请输入邀请码。" } });
  });

  it("maps invalid and used invites to Chinese field errors", () => {
    expect(
      getRegistrationCompletionError(new Error("Invite not found")),
    ).toEqual({
      fields: { inviteCode: "邀请码无效，请检查后重试。" },
    });
    expect(
      getRegistrationCompletionError(new Error("Invite already used")),
    ).toEqual({
      fields: { inviteCode: "这个邀请码已被使用。" },
    });
  });

  it("maps api validation details to field errors", () => {
    const error = new ApiClientError(
      "Invalid request",
      { fieldErrors: { nickname: ["Too small"] } },
      400,
    );

    expect(getRegistrationCompletionError(error)).toEqual({
      fields: { nickname: "请输入昵称。" },
    });
  });

  it("maps registration status failures to actionable Chinese form copy", () => {
    expect(
      getRegistrationStatusMessage(new Error("Registration state expired")),
    ).toBe("注册状态已失效，请返回注册页重新开始。");
    expect(
      getRegistrationCompletionError("Daily signup quota exceeded"),
    ).toEqual({
      form: "今日注册名额已用完，请明天再试或联系管理员获取邀请码。",
    });
  });
});
