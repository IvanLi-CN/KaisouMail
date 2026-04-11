import { Check, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type CopyFeedbackState = "idle" | "success" | "error";

type CopyFeedbackTooltipContentProps = {
  state: CopyFeedbackState;
  idleText: string;
  successText: string;
  errorText: string;
  idleDisplayText?: string;
  successDisplayText?: string;
  errorDisplayText?: string;
};

export const getCopyFeedbackLabel = ({
  state,
  idleText,
  successText,
  errorText,
}: CopyFeedbackTooltipContentProps) => {
  if (state === "success") {
    return successText;
  }

  if (state === "error") {
    return errorText;
  }

  return idleText;
};

export const CopyFeedbackTooltipContent = ({
  state,
  idleText,
  successText,
  errorText,
  idleDisplayText,
  successDisplayText,
  errorDisplayText,
}: CopyFeedbackTooltipContentProps): ReactNode => {
  if (state === "success") {
    return (
      <span className="copy-feedback-tooltip__content">
        <span
          aria-hidden
          className="copy-feedback-tooltip__icon copy-feedback-tooltip__icon--success"
        >
          <Check className="copy-feedback-tooltip__glyph" />
        </span>
        <span>{successDisplayText ?? successText}</span>
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="copy-feedback-tooltip__content">
        <span
          aria-hidden
          className="copy-feedback-tooltip__icon copy-feedback-tooltip__icon--error"
        >
          <CircleAlert className="copy-feedback-tooltip__glyph" />
        </span>
        <span>{errorDisplayText ?? errorText}</span>
      </span>
    );
  }

  return (
    <span className={cn("copy-feedback-tooltip__content")}>
      {idleDisplayText ?? idleText}
    </span>
  );
};
