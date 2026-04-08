import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

import { ApiClientError, apiClient } from "@/lib/api";

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

export type PasskeySupportState = {
  backendConfigured: boolean;
  buttonLabel: string;
  managementMessage: string | null;
  message: string;
  supported: boolean;
};

const isIpLiteralHost = (hostname: string) => {
  if (!hostname) {
    return false;
  }

  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
};

const normalizePasskeyErrorMessage = (message: string, fallback: string) => {
  const normalized = message.trim();
  const lowered = normalized.toLowerCase();

  if (
    lowered.includes("cancel") ||
    lowered.includes("abort") ||
    lowered.includes("notallowederror")
  ) {
    return "已取消 passkey 操作";
  }
  if (
    lowered.includes("not supported") ||
    lowered.includes("webauthn is not supported")
  ) {
    return "当前浏览器不支持 passkey";
  }

  return normalized || fallback;
};

export const getPasskeyErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ApiClientError) {
    return normalizePasskeyErrorMessage(error.message, fallback);
  }
  if (error instanceof Error) {
    return normalizePasskeyErrorMessage(error.message, fallback);
  }

  return fallback;
};

export const browserSupportsPasskeys = () => {
  if (DEMO_MODE) return true;

  try {
    if (isIpLiteralHost(globalThis.location?.hostname ?? "")) {
      return false;
    }

    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
};

export const resolvePasskeySupportState = ({
  browserSupported,
  hasMetaError = false,
  isMetaLoading = false,
  passkeyAuthEnabled,
}: {
  browserSupported: boolean;
  hasMetaError?: boolean;
  isMetaLoading?: boolean;
  passkeyAuthEnabled?: boolean;
}): PasskeySupportState => {
  if (!browserSupported) {
    return {
      backendConfigured: passkeyAuthEnabled === true,
      buttonLabel: "当前浏览器不支持 Passkey",
      managementMessage:
        passkeyAuthEnabled === false
          ? "当前环境未启用 Passkey，请先配置 WEB_APP_ORIGIN / WEB_APP_ORIGINS。"
          : null,
      message: "当前浏览器或上下文不支持 WebAuthn。",
      supported: false,
    };
  }

  if (isMetaLoading) {
    return {
      backendConfigured: false,
      buttonLabel: "Passkey 检查中…",
      managementMessage: "正在检查 Passkey 配置。",
      message: "正在检查 Passkey 配置。",
      supported: false,
    };
  }

  if (hasMetaError) {
    return {
      backendConfigured: false,
      buttonLabel: "Passkey 暂时不可用",
      managementMessage:
        "暂时无法确认 Passkey 配置，请稍后重试或改用 API Key。",
      message: "暂时无法确认 Passkey 配置，请稍后重试或改用 API Key。",
      supported: false,
    };
  }

  if (!passkeyAuthEnabled) {
    return {
      backendConfigured: false,
      buttonLabel: "当前环境未启用 Passkey",
      managementMessage:
        "当前环境未启用 Passkey，请先配置 WEB_APP_ORIGIN / WEB_APP_ORIGINS。",
      message:
        "当前环境未启用 Passkey，请先配置 WEB_APP_ORIGIN / WEB_APP_ORIGINS。",
      supported: false,
    };
  }

  return {
    backendConfigured: true,
    buttonLabel: "使用 Passkey 登录",
    managementMessage: null,
    message: " ",
    supported: true,
  };
};

export const signInWithPasskey = async () => {
  if (DEMO_MODE) {
    return apiClient.loginWithPasskeyDemo();
  }

  const options = await apiClient.createPasskeyAuthenticationOptions();
  const response = await startAuthentication({
    optionsJSON: options,
  });

  return apiClient.verifyPasskeyAuthentication(response);
};

export const registerPasskey = async (name: string) => {
  if (DEMO_MODE) {
    return apiClient.registerPasskeyDemo(name);
  }

  const options = await apiClient.createPasskeyRegistrationOptions(name);
  const response = await startRegistration({
    optionsJSON: options,
  });

  return apiClient.verifyPasskeyRegistration(response);
};
