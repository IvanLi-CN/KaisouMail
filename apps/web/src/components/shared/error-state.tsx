import {
  AlertCircle,
  Bug,
  LockKeyhole,
  type LucideIcon,
  SearchX,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ErrorStateVariant =
  | "fatal"
  | "not-found"
  | "permission"
  | "recoverable";

const variantStyles: Record<
  ErrorStateVariant,
  {
    eyebrow: string;
    icon: LucideIcon;
    glowClassName: string;
    iconClassName: string;
    badgeClassName: string;
  }
> = {
  fatal: {
    eyebrow: "Fatal error",
    icon: Bug,
    glowClassName:
      "from-red-500/20 via-rose-500/10 to-transparent dark:from-red-500/18",
    iconClassName: "border-red-400/35 bg-red-500/12 text-red-200",
    badgeClassName:
      "border-red-400/30 bg-red-500/10 text-red-100/90 shadow-[0_0_0_1px_rgba(248,113,113,0.08)_inset]",
  },
  "not-found": {
    eyebrow: "Not found",
    icon: SearchX,
    glowClassName:
      "from-sky-500/20 via-primary/10 to-transparent dark:from-sky-500/18",
    iconClassName: "border-primary/35 bg-primary/12 text-primary",
    badgeClassName:
      "border-primary/25 bg-primary/10 text-primary shadow-[0_0_0_1px_rgba(96,165,250,0.08)_inset]",
  },
  permission: {
    eyebrow: "Permission",
    icon: LockKeyhole,
    glowClassName:
      "from-amber-500/22 via-orange-500/10 to-transparent dark:from-amber-500/18",
    iconClassName: "border-amber-400/35 bg-amber-500/12 text-amber-200",
    badgeClassName:
      "border-amber-400/30 bg-amber-500/10 text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.08)_inset]",
  },
  recoverable: {
    eyebrow: "Recoverable",
    icon: AlertCircle,
    glowClassName:
      "from-primary/20 via-accent/10 to-transparent dark:from-primary/18",
    iconClassName: "border-border/80 bg-secondary text-foreground",
    badgeClassName:
      "border-border/70 bg-muted/30 text-foreground shadow-[0_0_0_1px_rgba(148,163,184,0.08)_inset]",
  },
};

export const ErrorState = ({
  variant,
  title,
  description,
  details = null,
  layout = "embedded",
  eyebrow,
  primaryAction,
  secondaryAction,
  className,
}: {
  variant: ErrorStateVariant;
  title: string;
  description: string;
  details?: string | null;
  layout?: "embedded" | "fullScreen";
  eyebrow?: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}) => {
  const resolvedVariant = variantStyles[variant];
  const Icon = resolvedVariant.icon;

  return (
    <div
      className={cn(
        "flex items-center justify-center",
        layout === "fullScreen" ? "min-h-screen px-4 py-10" : "min-h-[18rem]",
        className,
      )}
    >
      <Card
        className={cn(
          "relative w-full overflow-hidden border-border/80 bg-card/95 p-0 shadow-[0_32px_90px_rgba(2,6,23,0.34),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl",
          layout === "fullScreen" ? "max-w-3xl" : "max-w-full",
        )}
      >
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-100",
            resolvedVariant.glowClassName,
          )}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />

        <CardHeader className="relative mb-0 gap-6 p-6 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                resolvedVariant.badgeClassName,
              )}
            >
              {eyebrow ?? resolvedVariant.eyebrow}
            </span>
          </div>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                resolvedVariant.iconClassName,
              )}
            >
              <Icon className="h-6 w-6" />
            </div>

            <div className="space-y-3">
              <CardTitle className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
                {title}
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
                {description}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        {(primaryAction || secondaryAction || details) && (
          <CardContent className="relative space-y-5 border-t border-border/70 px-6 py-5 sm:px-7">
            {(primaryAction || secondaryAction) && (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {primaryAction ? (
                  <div className="shrink-0">{primaryAction}</div>
                ) : null}
                {secondaryAction ? (
                  <div className="shrink-0">{secondaryAction}</div>
                ) : null}
              </div>
            )}

            {details ? (
              <details className="group rounded-2xl border border-border/80 bg-muted/20 p-4">
                <summary className="cursor-pointer list-none text-sm font-medium text-foreground outline-none transition-colors duration-200 group-open:text-primary">
                  查看技术详情
                </summary>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-border/70 bg-background/70 p-4 text-xs leading-6 text-muted-foreground">
                  {details}
                </pre>
              </details>
            ) : null}
          </CardContent>
        )}
      </Card>
    </div>
  );
};
