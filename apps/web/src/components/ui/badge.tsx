import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Badge = ({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      "inline-flex items-center whitespace-nowrap rounded-md border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-secondary-foreground",
      className,
    )}
    {...props}
  />
);
