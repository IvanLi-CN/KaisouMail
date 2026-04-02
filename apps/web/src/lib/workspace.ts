import type { Mailbox } from "@/lib/contracts";

export type MailboxSortMode = "recent" | "created";

export const MAILBOX_SORT_STORAGE_KEY = "cf-mail:workspace-mailbox-sort";

export const isMailboxSortMode = (
  value: string | null | undefined,
): value is MailboxSortMode => value === "recent" || value === "created";

export const sortMailboxes = (mailboxes: Mailbox[], mode: MailboxSortMode) => {
  const entries = [...mailboxes];

  if (mode === "created") {
    return entries.sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        left.address.localeCompare(right.address),
    );
  }

  return entries.sort((left, right) => {
    if (left.lastReceivedAt && right.lastReceivedAt) {
      const recentDelta = right.lastReceivedAt.localeCompare(
        left.lastReceivedAt,
      );
      if (recentDelta !== 0) return recentDelta;
    } else if (left.lastReceivedAt) {
      return -1;
    } else if (right.lastReceivedAt) {
      return 1;
    }

    return (
      right.createdAt.localeCompare(left.createdAt) ||
      left.address.localeCompare(right.address)
    );
  });
};

export const filterMailboxes = (mailboxes: Mailbox[], query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return mailboxes;

  return mailboxes.filter((mailbox) =>
    mailbox.address.toLowerCase().includes(normalizedQuery),
  );
};

export const buildWorkspaceSearch = ({
  mailbox = "all",
  message,
  sort,
  q,
}: {
  mailbox?: string;
  message?: string | null;
  sort?: MailboxSortMode | null;
  q?: string | null;
}) => {
  const searchParams = new URLSearchParams();

  searchParams.set("mailbox", mailbox);
  if (sort) searchParams.set("sort", sort);
  if (q?.trim()) searchParams.set("q", q.trim());
  if (message) searchParams.set("message", message);

  return `?${searchParams.toString()}`;
};
