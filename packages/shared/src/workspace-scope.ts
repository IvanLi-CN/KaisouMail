type WorkspaceScopedMailboxLike = {
  status: string;
};

export const filterMailboxesForWorkspaceScope = <
  T extends WorkspaceScopedMailboxLike,
>(
  mailboxes: T[],
  _currentIso = new Date().toISOString(),
) =>
  mailboxes.filter(
    (mailbox) => mailbox.status === "active" || mailbox.status === "destroying",
  );
