import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const MailboxMessageSignal = ({
  hasMessages,
  disabled = false,
}: {
  hasMessages: boolean;
  disabled?: boolean;
}) => {
  const label = disabled ? "已销毁" : hasMessages ? "有新消息" : "暂无新消息";

  return (
    <Tooltip tooltipContent={label}>
      <span
        role="img"
        aria-label={label}
        className={cn(
          "inline-flex h-3 w-3 shrink-0 rounded-full border transition-colors duration-200",
          disabled
            ? "border-border bg-transparent opacity-50"
            : hasMessages
              ? "border-primary/70 bg-primary shadow-[0_0_0_3px_rgba(96,165,250,0.14)]"
              : "border-border bg-transparent",
        )}
      />
    </Tooltip>
  );
};
