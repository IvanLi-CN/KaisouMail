import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const PageHeader = ({
  title,
  description,
  eyebrow,
  action,
  className,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
      className,
    )}
  >
    <div className="space-y-3">
      {eyebrow ? (
        <Badge className="bg-primary/15 text-primary">{eyebrow}</Badge>
      ) : null}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </div>
);
