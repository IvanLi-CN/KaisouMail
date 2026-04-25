import {
  workspaceDestroyedMailboxMaxVisible,
  workspaceDestroyedMailboxRetentionDays,
} from "./consts";

type WorkspaceScopedMailboxLike = {
  status: string;
  destroyedAt: string | null;
};

export const resolveWorkspaceDestroyedCutoff = (
  currentIso = new Date().toISOString(),
) =>
  new Date(
    new Date(currentIso).getTime() -
      workspaceDestroyedMailboxRetentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();

export const filterMailboxesForWorkspaceScope = <
  T extends WorkspaceScopedMailboxLike,
>(
  mailboxes: T[],
  currentIso = new Date().toISOString(),
) => {
  const destroyedCutoff = resolveWorkspaceDestroyedCutoff(currentIso);
  const visibleDestroyedMailboxes = mailboxes
    .filter((mailbox) => {
      const { destroyedAt } = mailbox;
      return (
        mailbox.status === "destroyed" &&
        destroyedAt !== null &&
        destroyedAt >= destroyedCutoff
      );
    })
    .sort((left, right) =>
      (right.destroyedAt ?? "").localeCompare(left.destroyedAt ?? ""),
    )
    .slice(0, workspaceDestroyedMailboxMaxVisible);

  return [
    ...mailboxes.filter(
      (mailbox) =>
        mailbox.status !== "destroyed" && mailbox.status !== "expired",
    ),
    ...visibleDestroyedMailboxes,
  ];
};
