import {
  resolveMailboxExpiresAtFromMinutes,
  wouldExtendMailboxExpiry,
} from "@kaisoumail/shared";

import { Button } from "@/components/ui/button";
import type { Mailbox } from "@/lib/contracts";
import { formatDateTime, formatMailboxExpiry } from "@/lib/format";

const formatRequestedExpiry = (expiresInMinutes: number | null) => {
  const requestedExpiresAt =
    resolveMailboxExpiresAtFromMinutes(expiresInMinutes);
  if (requestedExpiresAt === null) return "长期";
  return formatDateTime(requestedExpiresAt);
};

export const ExistingMailboxPopover = ({
  mailbox,
  requestedExpiresInMinutes,
  isPending = false,
  result = null,
  error = null,
  onConfirm,
  onClose,
}: {
  mailbox: Mailbox;
  requestedExpiresInMinutes: number | null;
  isPending?: boolean;
  result?: "updated" | "unchanged" | null;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) => {
  const currentExpiryLabel =
    mailbox.source === "catch_all"
      ? "长期"
      : formatMailboxExpiry(mailbox.expiresAt);
  const requestedExpiryLabel = formatRequestedExpiry(requestedExpiresInMinutes);
  const canExtend = wouldExtendMailboxExpiry({
    currentExpiresAt: mailbox.expiresAt,
    requestedExpiresInMinutes,
  });

  return (
    <div className="w-80 space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">邮箱已存在</p>
        <p className="break-all text-xs leading-5 text-muted-foreground">
          {mailbox.address}
        </p>
      </div>

      {result === "updated" ? (
        <p className="text-sm leading-6 text-foreground">
          已把有效期更新到 {formatDateTime(mailbox.expiresAt)}
          ，现在可以继续使用。
        </p>
      ) : result === "unchanged" ? (
        <p className="text-sm leading-6 text-foreground">
          当前邮箱的有效期已经更长，不会缩短，直接继续使用这个邮箱就好。
        </p>
      ) : (
        <div className="space-y-2 text-sm leading-6 text-foreground">
          <p>
            当前有效期：
            <span className="font-medium">{currentExpiryLabel}</span>
          </p>
          <p>
            本次设置：
            <span className="font-medium">{requestedExpiryLabel}</span>
          </p>
          <p className="text-muted-foreground">
            {canExtend
              ? "要按这次设置延长有效期吗？"
              : "这次设置不会缩短当前有效期；确认后会继续沿用现有邮箱。"}
          </p>
        </div>
      )}

      {error ? (
        <p className="text-xs leading-5 text-destructive">{error}</p>
      ) : null}

      <div className="flex justify-end gap-2">
        {result ? (
          <Button size="sm" onClick={onClose}>
            我知道了
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={onClose}>
              暂不处理
            </Button>
            <Button size="sm" disabled={isPending} onClick={onConfirm}>
              {isPending
                ? "处理中…"
                : canExtend
                  ? "延长有效期"
                  : "保持当前有效期"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
