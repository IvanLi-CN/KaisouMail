import { useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "cf-mail:read-message-ids";
const CHANGE_EVENT = "cf-mail:read-message-ids-change";

const readSnapshot = () => {
  if (typeof window === "undefined") {
    return "[]";
  }

  return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
};

const writeSnapshot = (messageIds: string[]) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messageIds));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
};

export const markMessageAsRead = (messageId: string | null | undefined) => {
  if (typeof window === "undefined" || !messageId) {
    return;
  }

  const messageIds = new Set(parseSnapshot(readSnapshot()));

  if (messageIds.has(messageId)) {
    return;
  }

  messageIds.add(messageId);
  writeSnapshot([...messageIds]);
};

const subscribe = (onStoreChange: () => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleChange = () => onStoreChange();

  window.addEventListener("storage", handleChange);
  window.addEventListener(CHANGE_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(CHANGE_EVENT, handleChange);
  };
};

const parseSnapshot = (snapshot: string) => {
  try {
    const parsed = JSON.parse(snapshot);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
};

export const useReadMessageIds = () => {
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () => "[]");

  return useMemo(() => parseSnapshot(snapshot), [snapshot]);
};
