import { KeyRound } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type CopyFeedbackState,
  CopyFeedbackTooltipContent,
  getCopyFeedbackLabel,
} from "@/components/shared/copy-feedback-tooltip-content";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { writeClipboardText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

const COPY_FEEDBACK_DURATION_MS = 1_500;

type VerificationCopyButtonProps = {
  code: string;
  variant: "compact" | "panel";
  className?: string;
};

export const VerificationCopyButton = ({
  code,
  variant,
  className,
}: VerificationCopyButtonProps) => {
  const [copyState, setCopyState] = useState<CopyFeedbackState>("idle");
  const resetTimerRef = useRef<number | null>(null);
  const tooltipLabel = getCopyFeedbackLabel({
    state: copyState,
    idleText: `复制验证码 ${code}`,
    successText: `已复制验证码 ${code}`,
    errorText: "复制失败，请重试",
  });
  const tooltipContent = (
    <CopyFeedbackTooltipContent
      errorText="复制失败，请重试"
      idleText={`复制验证码 ${code}`}
      state={copyState}
      successText={`已复制验证码 ${code}`}
      successDisplayText="已复制"
    />
  );

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  const handleCopy = async (
    event: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await writeClipboardText(code);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = window.setTimeout(() => {
      setCopyState("idle");
    }, COPY_FEEDBACK_DURATION_MS);
  };

  if (variant === "compact") {
    return (
      <Tooltip
        delayDuration={120}
        forceOpen={copyState !== "idle"}
        tooltipContent={tooltipContent}
      >
        <Button
          aria-label={tooltipLabel}
          className={cn(
            "h-7 min-w-[4.5rem] shrink-0 gap-1 rounded-full border-primary/35 bg-primary/12 px-1.5 font-mono text-[10px] font-semibold text-primary shadow-[inset_0_0_0_1px_rgba(96,165,250,0.08)] hover:bg-primary/18",
            className,
          )}
          data-copied={copyState === "success" ? "true" : undefined}
          size="sm"
          variant="outline"
          onClick={(event) => {
            void handleCopy(event);
          }}
        >
          <span
            aria-hidden
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/18 text-primary"
          >
            <KeyRound className="h-2.5 w-2.5 shrink-0" />
          </span>
          <span className="leading-none tabular-nums tracking-[0.08em]">
            {code}
          </span>
        </Button>
      </Tooltip>
    );
  }

  return (
    <Tooltip
      delayDuration={120}
      forceOpen={copyState !== "idle"}
      tooltipContent={tooltipContent}
    >
      <button
        aria-label={tooltipLabel}
        className={cn(
          "flex min-h-[4.5rem] w-24 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-center transition-colors duration-150 hover:bg-primary/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-28",
          className,
        )}
        data-copied={copyState === "success" ? "true" : undefined}
        type="button"
        onClick={(event) => {
          void handleCopy(event);
        }}
      >
        <span className="font-mono text-lg font-semibold text-primary sm:text-[1.75rem]">
          {code}
        </span>
      </button>
    </Tooltip>
  );
};
