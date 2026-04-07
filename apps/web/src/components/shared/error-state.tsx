import {
  AlertCircle,
  Bug,
  LockKeyhole,
  type LucideIcon,
  SearchX,
} from "lucide-react";
import type { ReactNode } from "react";
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
    status: string;
    tone: string;
    icon: LucideIcon;
    accentClassName: string;
    haloClassName: string;
    iconClassName: string;
    badgeClassName: string;
    railClassName: string;
    statusClassName: string;
    points: string[];
  }
> = {
  fatal: {
    eyebrow: "Fatal error",
    status: "500",
    tone: "渲染已拦截",
    icon: Bug,
    accentClassName: "from-red-400/90 via-red-500/45 to-red-500/0",
    haloClassName: "bg-red-500/18",
    iconClassName: "border-red-400/35 bg-red-500/12 text-red-200",
    badgeClassName: "border-red-400/25 bg-red-500/8 text-red-100/90",
    railClassName: "border-red-400/15 bg-red-500/6",
    statusClassName: "text-red-200/16",
    points: [
      "先重试当前入口，确认是否为瞬时渲染异常。",
      "若仍失败，可回到工作台继续其它操作，不会丢失会话。",
      "需要排查时，再展开技术详情查看 trace 或状态码。",
    ],
  },
  "not-found": {
    eyebrow: "Not found",
    status: "404",
    tone: "目标入口不存在",
    icon: SearchX,
    accentClassName: "from-sky-400/90 via-primary/45 to-primary/0",
    haloClassName: "bg-sky-500/18",
    iconClassName: "border-primary/35 bg-primary/12 text-primary",
    badgeClassName: "border-primary/25 bg-primary/10 text-primary",
    railClassName: "border-primary/15 bg-primary/6",
    statusClassName: "text-primary/16",
    points: [
      "优先回到工作台或邮箱管理，再从稳定导航重新进入。",
      "如果是手动输入地址，检查路径、查询参数和 hash 是否正确。",
      "这类错误不会影响已存在的邮箱或消息数据。",
    ],
  },
  permission: {
    eyebrow: "Permission",
    status: "403",
    tone: "当前身份不可访问",
    icon: LockKeyhole,
    accentClassName: "from-amber-400/90 via-amber-500/40 to-amber-500/0",
    haloClassName: "bg-amber-500/18",
    iconClassName: "border-amber-400/35 bg-amber-500/12 text-amber-200",
    badgeClassName: "border-amber-400/25 bg-amber-500/9 text-amber-100",
    railClassName: "border-amber-400/15 bg-amber-500/6",
    statusClassName: "text-amber-200/16",
    points: [
      "返回你有权限的入口，避免在不可访问页面里反复刷新。",
      "需要更高权限时，切换具备权限的 API Key 重新登录。",
      "权限拒绝与数据不存在不同，已登录状态本身可能仍然有效。",
    ],
  },
  recoverable: {
    eyebrow: "Recoverable",
    status: "TEMP",
    tone: "可恢复的数据失败",
    icon: AlertCircle,
    accentClassName: "from-primary/90 via-accent/40 to-accent/0",
    haloClassName: "bg-primary/18",
    iconClassName: "border-border/80 bg-secondary text-foreground",
    badgeClassName: "border-border/70 bg-muted/35 text-foreground",
    railClassName: "border-border/70 bg-background/45",
    statusClassName: "text-foreground/12",
    points: [
      "这是可恢复失败，不会再被伪装成“空状态”。",
      "先点重试；如果页面已有缓存数据，优先保留可见内容继续操作。",
      "只有确认源数据不可用时，才需要回退到上一级页面。",
    ],
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
  const TitleTag = layout === "fullScreen" ? "h1" : "h2";
  const iconSizeClassName =
    layout === "fullScreen" ? "h-7 w-7 sm:h-8 sm:w-8" : "h-6 w-6";
  const usesRecoveryRail = layout === "fullScreen";

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "w-full",
        layout === "fullScreen"
          ? "mx-auto grid min-h-screen max-w-[1180px] items-center px-4 py-10 lg:py-14"
          : "min-h-[18rem]",
        className,
      )}
    >
      <section className="relative w-full overflow-hidden rounded-[28px] border border-border/80 bg-card/92 shadow-[0_32px_90px_rgba(2,6,23,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-0 top-0 h-full w-px bg-gradient-to-b opacity-90",
            resolvedVariant.accentClassName,
          )}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
        />
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full blur-3xl",
            resolvedVariant.haloClassName,
          )}
        />

        <div
          className={cn(
            "relative grid",
            usesRecoveryRail ? "lg:grid-cols-[minmax(0,1fr)_320px]" : "",
          )}
        >
          <div className={cn("relative", layout === "fullScreen" ? "" : "")}>
            <div className="p-6 sm:p-7 lg:p-9">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                    resolvedVariant.badgeClassName,
                  )}
                >
                  {eyebrow ?? resolvedVariant.eyebrow}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {resolvedVariant.tone}
                </span>
              </div>

              <div className="mt-6 grid gap-6">
                <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-start">
                  <div
                    className={cn(
                      "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:h-16 sm:w-16",
                      resolvedVariant.iconClassName,
                    )}
                  >
                    <Icon className={iconSizeClassName} />
                  </div>

                  <div className="min-w-0 space-y-4">
                    <div className="space-y-3">
                      <p
                        className={cn(
                          "font-mono text-4xl font-semibold tracking-[-0.08em] sm:text-5xl",
                          layout === "fullScreen" ? "block" : "hidden sm:block",
                          resolvedVariant.statusClassName,
                        )}
                      >
                        {resolvedVariant.status}
                      </p>
                      <TitleTag className="max-w-3xl text-2xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
                        {title}
                      </TitleTag>
                      <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
                        {description}
                      </p>
                    </div>

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
                  </div>
                </div>

                {details ? (
                  <details className="group rounded-2xl border border-border/75 bg-background/35">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors duration-200 group-open:text-primary">
                      <span>诊断信息</span>
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground transition-transform duration-200 group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <div className="border-t border-border/70 px-4 py-4">
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-border/70 bg-background/70 p-4 text-xs leading-6 text-muted-foreground">
                        {details}
                      </pre>
                    </div>
                  </details>
                ) : null}

                {!usesRecoveryRail ? (
                  <div className="rounded-2xl border border-border/70 bg-background/25 p-4 sm:p-5">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Recovery
                        </p>
                        <div
                          className={cn(
                            "rounded-2xl border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
                            resolvedVariant.railClassName,
                          )}
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Status
                          </p>
                          <div className="mt-3 flex flex-wrap items-end gap-3">
                            <span className="font-mono text-3xl font-semibold tracking-[-0.08em] text-foreground">
                              {resolvedVariant.status}
                            </span>
                            <span className="pb-1 text-sm text-muted-foreground">
                              {resolvedVariant.tone}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Recommended next step
                        </p>
                        <ul className="space-y-3">
                          {resolvedVariant.points.map((point) => (
                            <li
                              key={point}
                              className="flex items-start gap-3 text-sm leading-6 text-muted-foreground"
                            >
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {usesRecoveryRail ? (
            <aside className="relative border-t border-border/70 bg-background/20 lg:border-t-0 lg:border-l lg:bg-background/30">
              <div className="flex h-full flex-col justify-between p-6 sm:p-7">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Recovery
                    </p>
                    <div
                      className={cn(
                        "rounded-2xl border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
                        resolvedVariant.railClassName,
                      )}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Status
                      </p>
                      <div className="mt-3 flex items-end gap-3">
                        <span className="font-mono text-3xl font-semibold tracking-[-0.08em] text-foreground">
                          {resolvedVariant.status}
                        </span>
                        <span className="pb-1 text-sm text-muted-foreground">
                          {resolvedVariant.tone}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Recommended next step
                    </p>
                    <ul className="space-y-3">
                      {resolvedVariant.points.map((point) => (
                        <li
                          key={point}
                          className="flex items-start gap-3 text-sm leading-6 text-muted-foreground"
                        >
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </section>
    </div>
  );
};
