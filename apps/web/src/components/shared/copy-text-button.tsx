import { Copy } from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";

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

export const CopyTextButton = ({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) => {
  const [copyState, setCopyState] = useState<CopyFeedbackState>("idle");
  const resetTimerRef = useRef<number | null>(null);
  const tooltipLabel = getCopyFeedbackLabel({
    state: copyState,
    idleText: `复制 ${label}`,
    successText: `已复制 ${label}`,
    errorText: `${label}复制失败，请重试`,
  });
  const tooltipContent = (
    <CopyFeedbackTooltipContent
      errorText="复制失败，请重试"
      idleDisplayText="复制"
      idleText={`复制 ${label}`}
      state={copyState}
      successDisplayText="已复制"
      successText={`已复制 ${label}`}
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

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await writeClipboardText(value);
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

  return (
    <Tooltip
      delayDuration={120}
      forceOpen={copyState !== "idle"}
      tooltipContent={tooltipContent}
    >
      <Button
        aria-label={tooltipLabel}
        className={cn("min-h-10 shrink-0", className)}
        data-copied={copyState === "success" ? "true" : undefined}
        size="sm"
        type="button"
        variant="outline"
        onClick={(event) => {
          void handleCopy(event);
        }}
      >
        <Copy className="h-3.5 w-3.5" />
        复制
      </Button>
    </Tooltip>
  );
};
