import { ApiClientError } from "@/lib/api";

export type RegistrationErrorField = "inviteCode" | "nickname" | "passkeyName";

export type RegistrationFormError = {
  form?: string | null;
  fields?: Partial<Record<RegistrationErrorField, string>>;
};

const fieldFallbacks: Record<RegistrationErrorField, string> = {
  inviteCode: "邀请码格式不正确，请检查后重试。",
  nickname: "请输入昵称。",
  passkeyName: "请输入设备名称。",
};

const normalizeMessage = (message: string) => message.trim().toLowerCase();

const mapInviteMessage = (message: string) => {
  const normalizedMessage = normalizeMessage(message);
  if (
    normalizedMessage === "invite required" ||
    normalizedMessage === "bootstrap invite required"
  ) {
    return "请输入邀请码。";
  }
  if (
    normalizedMessage === "invite not found" ||
    normalizedMessage === "invalid bootstrap invite"
  ) {
    return "邀请码无效，请检查后重试。";
  }
  if (
    normalizedMessage === "invite already used" ||
    normalizedMessage === "bootstrap invite already used"
  ) {
    return "这个邀请码已被使用。";
  }
  return null;
};

const mapFormMessage = (message: string, fallback: string) => {
  const normalizedMessage = normalizeMessage(message);
  if (normalizedMessage === "registration is disabled") {
    return "当前暂未开放注册，请联系管理员确认开放时间。";
  }
  if (normalizedMessage === "passkey registration is disabled") {
    return "当前暂未开放 Passkey 注册，请改用已启用的注册方式。";
  }
  if (normalizedMessage === "daily signup quota exceeded") {
    return "今日注册名额已用完，请明天再试或联系管理员获取邀请码。";
  }
  if (
    normalizedMessage === "pending registration not found" ||
    normalizedMessage === "registration state expired" ||
    normalizedMessage.includes("token")
  ) {
    return "注册状态已失效，请返回注册页重新开始。";
  }
  if (normalizedMessage === "invalid request") {
    return "提交内容不完整，请检查表单后重试。";
  }
  return fallback;
};

const extractFieldErrors = (details: unknown) => {
  if (!details || typeof details !== "object" || !("fieldErrors" in details)) {
    return {};
  }
  const fieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(fieldErrors as Record<string, unknown>)
      .map(([field, messages]) => {
        const firstMessage = Array.isArray(messages)
          ? messages.find(
              (message): message is string => typeof message === "string",
            )
          : null;
        return [field, firstMessage] as const;
      })
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
};

const mapApiFieldError = (
  field: RegistrationErrorField,
  message: string | undefined,
) => {
  if (field === "inviteCode") {
    return mapInviteMessage(message ?? "") ?? fieldFallbacks.inviteCode;
  }
  if (field === "nickname") {
    const normalizedMessage = normalizeMessage(message ?? "");
    if (
      normalizedMessage.includes("too_big") ||
      normalizedMessage.includes("64")
    ) {
      return "昵称最多 64 个字符。";
    }
  }
  if (field === "passkeyName") {
    const normalizedMessage = normalizeMessage(message ?? "");
    if (
      normalizedMessage.includes("too_big") ||
      normalizedMessage.includes("64")
    ) {
      return "设备名称最多 64 个字符。";
    }
  }
  return fieldFallbacks[field];
};

export const getRegistrationCompletionError = (
  reason: unknown,
  fallback = "注册失败，请稍后重试。",
): RegistrationFormError => {
  const message =
    typeof reason === "string"
      ? reason
      : reason instanceof Error && reason.message
        ? reason.message
        : fallback;
  const inviteMessage = mapInviteMessage(message);
  if (inviteMessage) {
    return { fields: { inviteCode: inviteMessage } };
  }

  if (reason instanceof ApiClientError) {
    const apiFieldErrors = extractFieldErrors(reason.details);
    const fields: RegistrationFormError["fields"] = {};
    for (const field of [
      "inviteCode",
      "nickname",
      "passkeyName",
    ] satisfies RegistrationErrorField[]) {
      if (apiFieldErrors[field]) {
        fields[field] = mapApiFieldError(field, apiFieldErrors[field]);
      }
    }
    if (Object.keys(fields).length > 0) {
      return { fields };
    }
  }

  return { form: mapFormMessage(message, fallback) };
};

export const getRegistrationStatusMessage = (
  reason: unknown,
  fallback = "注册状态已失效，请返回注册页重新开始。",
) => {
  const message =
    typeof reason === "string"
      ? reason
      : reason instanceof Error && reason.message
        ? reason.message
        : fallback;
  return mapFormMessage(message, fallback);
};
