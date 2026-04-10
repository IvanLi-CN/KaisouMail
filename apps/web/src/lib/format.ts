export const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export const formatRelativeMinutes = (expiresAt: string | null | undefined) => {
  if (!expiresAt) return "长期";
  const deltaMinutes = Math.round(
    (new Date(expiresAt).getTime() - Date.now()) / 60_000,
  );
  if (deltaMinutes <= 0) return "已过期";
  if (deltaMinutes < 60) return `${deltaMinutes} 分钟后过期`;
  const hours = Math.floor(deltaMinutes / 60);
  const minutes = deltaMinutes % 60;
  return `${hours} 小时 ${minutes} 分钟后过期`;
};

export const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};
