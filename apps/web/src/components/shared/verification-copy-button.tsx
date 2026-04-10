import { Check, Copy } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COPY_FEEDBACK_DURATION_MS = 1_500;

const fallbackCopyText = async (value: string) => {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.select();

  const copied =
    typeof document.execCommand === "function" && document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Clipboard unavailable");
  }
};

const writeClipboardText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to the legacy execCommand path for insecure origins,
      // denied clipboard permissions, or embedded browser environments.
    }
  }

  await fallbackCopyText(value);
};

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
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

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

    await writeClipboardText(code);
    setCopied(true);

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
    }, COPY_FEEDBACK_DURATION_MS);
  };

  if (variant === "compact") {
    return (
      <Button
        aria-label={`复制验证码 ${code}`}
        className={cn(
          "h-7 shrink-0 rounded-md border-primary/30 bg-primary/10 px-2 text-[11px] text-primary hover:bg-primary/18",
          className,
        )}
        size="sm"
        variant="outline"
        onClick={(event) => {
          void handleCopy(event);
        }}
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" />
            已复制
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            验证码
          </>
        )}
      </Button>
    );
  }

  return (
    <button
      aria-label={`复制验证码 ${code}`}
      className={cn(
        "flex min-h-[4.5rem] w-24 shrink-0 flex-col items-center justify-center rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-center transition-colors duration-150 hover:bg-primary/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-28",
        className,
      )}
      type="button"
      onClick={(event) => {
        void handleCopy(event);
      }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/80">
        验证码
      </span>
      <span className="mt-1 font-mono text-lg font-semibold text-primary">
        {code}
      </span>
      <span className="mt-1 text-[11px] text-primary/80">
        {copied ? "已复制" : "点击复制"}
      </span>
    </button>
  );
};
