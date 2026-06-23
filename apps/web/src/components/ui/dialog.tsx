import * as React from "react";

import { cn } from "@/lib/utils";

export const Dialog = ({
  children,
  open,
  onOpenChange,
}: {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  React.useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div className="absolute inset-0 bg-slate-950/72 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-2xl">{children}</div>
    </div>
  );
};

export const DialogPanel = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "rounded-[28px] border border-border/80 bg-background/95 shadow-[0_36px_120px_rgba(2,6,23,0.55)]",
      className,
    )}
  >
    {children}
  </div>
);

export const DialogHeader = ({
  title,
  description,
}: {
  title: string;
  description?: string;
}) => (
  <div className="border-b border-border/70 px-6 py-5 sm:px-7">
    <h2 className="text-2xl font-semibold tracking-tight text-foreground">
      {title}
    </h2>
    {description ? (
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    ) : null}
  </div>
);

export const DialogBody = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => <div className={cn("px-6 py-5 sm:px-7", className)}>{children}</div>;

export const DialogFooter = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-3 border-t border-border/70 px-6 py-5 sm:flex-row sm:justify-end sm:px-7",
      className,
    )}
  >
    {children}
  </div>
);
