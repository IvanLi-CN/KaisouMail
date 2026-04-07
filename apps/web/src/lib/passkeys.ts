import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

import { ApiClientError, apiClient } from "@/lib/api";

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

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
