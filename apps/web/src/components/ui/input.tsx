import * as React from "react";

import { noAutofillAttributes } from "@/lib/no-autofill";
import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  allowAutoFill?: boolean;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ allowAutoFill = false, autoComplete, className, ...props }, ref) => {
    const autofillProps = allowAutoFill
      ? { autoComplete }
      : noAutofillAttributes(autoComplete);

    return (
      <input
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-muted/40 px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20",
          className,
        )}
        {...autofillProps}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
