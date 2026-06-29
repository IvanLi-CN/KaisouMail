import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Skeleton = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    aria-hidden="true"
    className={cn(
      "rounded-lg bg-white/10 motion-safe:animate-pulse",
      className,
    )}
    {...props}
  />
);
