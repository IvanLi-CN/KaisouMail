import type { LabelHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Label = ({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: wrapper forwards htmlFor to the actual input caller.
  <label
    className={cn("text-sm font-medium text-foreground", className)}
    {...props}
  />
);
