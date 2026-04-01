import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Badge = ({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground",
      className,
    )}
    {...props}
  />
);
