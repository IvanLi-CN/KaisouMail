import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const PageHeader = ({
  title,
  description,
  eyebrow,
  action,
  className,
}: {
  title: string;
  description: ReactNode;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "flex min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6",
      className,
    )}
  >
    <div className="min-w-0 flex-1 space-y-2">
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
      ) : null}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {typeof description === "string" ? (
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : (
          description
        )}
      </div>
    </div>
    {action ? (
      <div className="w-full min-w-0 lg:w-auto lg:shrink-0">{action}</div>
    ) : null}
  </div>
);
