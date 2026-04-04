import type { MessageSummary } from "@/lib/contracts";

export const resolveAutoRefreshInterval = ({
  requestedIntervalMs,
  isDocumentVisible,
  isOnline,
}: {
  requestedIntervalMs?: number;
  isDocumentVisible: boolean;
  isOnline: boolean;
}) => {
  if (!requestedIntervalMs || requestedIntervalMs <= 0) return false;
  if (!isDocumentVisible || !isOnline) return false;
  return requestedIntervalMs;
};

export const resolveLatestRefreshAt = (...timestamps: number[]) => {
  const latest = timestamps
    .filter((value) => value > 0)
    .sort((a, b) => b - a)[0];
  return latest ?? null;
};

export const resolveNextSelectedMessageId = (
  messages: MessageSummary[],
  selectedMessageId: string | null,
) => {
  if (messages.length === 0) return null;
  if (!selectedMessageId) return messages[0]?.id ?? null;
  return messages.some((message) => message.id === selectedMessageId)
    ? selectedMessageId
    : (messages[0]?.id ?? null);
};

export const formatRefreshTime = (timestamp: number | null) => {
  if (!timestamp) return "等待首次同步";

  return `更新于 ${new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp)}`;
};
