export const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatDateOnly = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
  }).format(new Date(value));

export const formatMailboxExpiry = (expiresAt: string | null | undefined) => {
  if (!expiresAt) return "长期";
  const timestamp = new Date(expiresAt).getTime();
  if (Number.isNaN(timestamp)) return "—";

  const deltaMinutes = Math.round((timestamp - Date.now()) / 60_000);
  if (deltaMinutes <= 0) return "已过期";
  if (deltaMinutes < 60) return `${deltaMinutes} 分钟后到期`;

  const deltaHours = deltaMinutes / 60;
  if (deltaHours < 48) return `${Math.round(deltaHours)} 小时后到期`;

  const deltaDays = deltaHours / 24;
  if (deltaDays < 14) return `${Math.round(deltaDays)} 天后到期`;

  return `到期于 ${formatDateOnly(expiresAt)}`;
};

export const formatRelativeMinutes = formatMailboxExpiry;

export const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};
