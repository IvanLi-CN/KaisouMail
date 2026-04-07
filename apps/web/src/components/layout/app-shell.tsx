import {
  BriefcaseBusiness,
  ChevronDown,
  Globe,
  KeyRound,
  LayoutPanelTop,
  LogOut,
  Mailbox,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type PropsWithChildren,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Link, matchPath, useLocation } from "react-router-dom";

import { ActionButton } from "@/components/ui/action-button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import type { SessionUser, VersionInfo } from "@/lib/contracts";
import { projectMeta } from "@/lib/project-meta";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutPanelTop;
  activePatterns: string[];
  adminOnly?: boolean;
};

const navItems = [
  {
    to: "/workspace",
    label: "工作台",
    icon: LayoutPanelTop,
    activePatterns: ["/", "/workspace", "/messages/:messageId"],
  },
  {
    to: "/mailboxes",
    label: "邮箱管理",
    icon: Mailbox,
    activePatterns: ["/mailboxes", "/mailboxes/:mailboxId"],
  },
  {
    to: "/domains",
    label: "域名",
    icon: Globe,
    activePatterns: ["/domains"],
    adminOnly: true,
  },
  {
    to: "/api-keys",
    label: "API Keys",
    icon: KeyRound,
    activePatterns: ["/api-keys", "/api-keys/docs"],
  },
  {
    to: "/users",
    label: "用户",
    icon: UserRound,
    activePatterns: ["/users"],
    adminOnly: true,
  },
] satisfies readonly NavItem[];

const ACCOUNT_PREVIEW_CLOSE_DELAY_MS = 80;

export const AppShell = ({
  user,
  version,
  onLogout,
  children,
  defaultAccountPopoverOpen = false,
}: PropsWithChildren<{
  user: SessionUser;
  version?: VersionInfo | null;
  onLogout: () => void;
  defaultAccountPopoverOpen?: boolean;
}>) => {
  const location = useLocation();
  const pathname = location.pathname === "/" ? "/workspace" : location.pathname;
  const footerLinks = [
    {
      href: projectMeta.repositoryUrl,
      label: projectMeta.repositoryLabel,
    },
    {
      href: projectMeta.developerUrl,
      label: projectMeta.developerName,
    },
    {
      href: projectMeta.versionUrl,
      label: `Version ${version?.version ?? "dev"}`,
    },
  ] as const;
  const accountPopoverId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const closePreviewTimerRef = useRef<number | null>(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isAccountPopoverPinned, setIsAccountPopoverPinned] = useState(
    defaultAccountPopoverOpen,
  );
  const [isAccountPopoverPreviewing, setIsAccountPopoverPreviewing] =
    useState(false);
  const isAccountPopoverOpen =
    isAccountPopoverPinned || isAccountPopoverPreviewing;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: none), (pointer: coarse)");
    const syncPointerMode = () => setIsCoarsePointer(mediaQuery.matches);

    syncPointerMode();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncPointerMode);

      return () => {
        mediaQuery.removeEventListener("change", syncPointerMode);
      };
    }

    const legacyMediaQuery = mediaQuery as MediaQueryList & {
      addListener: (listener: () => void) => void;
      removeListener: (listener: () => void) => void;
    };

    legacyMediaQuery.addListener(syncPointerMode);

    return () => {
      legacyMediaQuery.removeListener(syncPointerMode);
    };
  }, []);

  useEffect(
    () => () => {
      if (closePreviewTimerRef.current !== null) {
        window.clearTimeout(closePreviewTimerRef.current);
      }
    },
    [],
  );

  const clearPreviewCloseTimer = () => {
    if (closePreviewTimerRef.current === null) return;

    window.clearTimeout(closePreviewTimerRef.current);
    closePreviewTimerRef.current = null;
  };

  const closeAccountPopover = () => {
    clearPreviewCloseTimer();
    setIsAccountPopoverPreviewing(false);
    setIsAccountPopoverPinned(false);
  };

  const openAccountPreview = () => {
    if (isCoarsePointer || isAccountPopoverPinned) return;

    clearPreviewCloseTimer();
    setIsAccountPopoverPreviewing(true);
  };

  const scheduleAccountPreviewClose = () => {
    if (isCoarsePointer || isAccountPopoverPinned) return;

    clearPreviewCloseTimer();
    closePreviewTimerRef.current = window.setTimeout(() => {
      setIsAccountPopoverPreviewing(false);
      closePreviewTimerRef.current = null;
    }, ACCOUNT_PREVIEW_CLOSE_DELAY_MS);
  };

  const handlePopoverFocus = () => {
    if (isAccountPopoverPinned) return;

    clearPreviewCloseTimer();
    setIsAccountPopoverPreviewing(true);
  };

  const handlePopoverBlur = (event: FocusEvent<HTMLElement>) => {
    if (isAccountPopoverPinned) return;

    const nextTarget = event.relatedTarget;
    if (
      nextTarget instanceof Node &&
      (triggerRef.current?.contains(nextTarget) ||
        contentRef.current?.contains(nextTarget))
    ) {
      return;
    }

    clearPreviewCloseTimer();
    setIsAccountPopoverPreviewing(false);
  };

  const handleAccountTriggerClick = () => {
    clearPreviewCloseTimer();

    if (isAccountPopoverPinned) {
      setIsAccountPopoverPinned(false);
      setIsAccountPopoverPreviewing(false);
      return;
    }

    setIsAccountPopoverPinned(true);
    setIsAccountPopoverPreviewing(true);
  };

  const handleAccountEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || !isAccountPopoverOpen) return;

    event.preventDefault();
    event.stopPropagation();
    closeAccountPopover();
    triggerRef.current?.focus();
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#app-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:text-foreground"
      >
        跳到主内容
      </a>

      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="mx-auto flex max-w-[1520px] flex-col gap-4 px-4 py-4 lg:px-6 xl:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-4">
              <Link to="/workspace" className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary text-primary">
                  <BriefcaseBusiness className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold tracking-[0.18em] text-foreground uppercase">
                    {projectMeta.projectName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Temporary inbox control plane
                  </span>
                </span>
              </Link>

              <nav
                aria-label="主导航"
                className="flex flex-wrap items-center gap-2"
              >
                {navItems
                  .filter((item) => !item.adminOnly || user.role === "admin")
                  .map((item) => {
                    const isActive = item.activePatterns.some((pattern) =>
                      Boolean(
                        matchPath(
                          { path: pattern, end: pattern === item.to },
                          pathname,
                        ),
                      ),
                    );

                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isActive
                            ? "border-border bg-secondary text-foreground"
                            : "border-transparent text-muted-foreground hover:border-border hover:bg-white/5 hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
              </nav>
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Popover
                open={isAccountPopoverOpen}
                onOpenChange={(nextOpen) => {
                  if (!nextOpen) {
                    closeAccountPopover();
                  }
                }}
              >
                <PopoverAnchor asChild>
                  <button
                    ref={triggerRef}
                    aria-controls={accountPopoverId}
                    aria-expanded={isAccountPopoverOpen}
                    aria-haspopup="dialog"
                    className={cn(
                      "inline-flex min-w-0 items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-[12rem]",
                      isAccountPopoverOpen
                        ? "bg-card/95 text-foreground"
                        : "text-muted-foreground hover:border-border/80 hover:text-foreground",
                    )}
                    onBlur={handlePopoverBlur}
                    onClick={handleAccountTriggerClick}
                    onFocus={handlePopoverFocus}
                    onKeyDown={handleAccountEscape}
                    onMouseEnter={openAccountPreview}
                    onMouseLeave={scheduleAccountPreviewClose}
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ShieldCheck
                        aria-hidden
                        className="h-4 w-4 shrink-0 text-primary"
                      />
                      <span className="truncate text-sm font-medium text-foreground">
                        {user.name}
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform duration-200",
                        isAccountPopoverOpen
                          ? "rotate-180 text-foreground"
                          : "text-muted-foreground",
                      )}
                    />
                  </button>
                </PopoverAnchor>
                <PopoverContent
                  id={accountPopoverId}
                  ref={contentRef}
                  align="end"
                  className="w-[min(calc(100vw-2rem),20rem)] space-y-4 px-4 py-4"
                  onBlur={handlePopoverBlur}
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                  }}
                  onEscapeKeyDown={() => {
                    closeAccountPopover();
                  }}
                  onFocus={handlePopoverFocus}
                  onMouseEnter={openAccountPreview}
                  onMouseLeave={scheduleAccountPreviewClose}
                  onOpenAutoFocus={(event) => {
                    event.preventDefault();
                  }}
                >
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      账号详情
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {user.name}
                    </p>
                  </div>

                  <dl className="space-y-3">
                    <div className="space-y-1">
                      <dt className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        邮箱
                      </dt>
                      <dd className="break-all text-sm text-foreground">
                        {user.email}
                      </dd>
                    </div>

                    <div className="space-y-1">
                      <dt className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        角色
                      </dt>
                      <dd>
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
                          {user.role}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </PopoverContent>
              </Popover>
              <ActionButton
                density="default"
                icon={LogOut}
                label="退出登录"
                onClick={onLogout}
                priority="secondary"
                variant="outline"
              />
            </div>
          </div>
        </div>
      </header>

      <main
        id="app-main"
        className="mx-auto flex min-h-0 min-w-0 w-full max-w-[1520px] flex-1 flex-col px-4 py-6 lg:px-6 xl:px-8"
      >
        {children}
      </main>

      <footer className="border-t border-border bg-background/95">
        <div className="mx-auto flex max-w-[1520px] flex-col gap-3 px-4 py-4 text-xs text-muted-foreground lg:px-6 xl:px-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold tracking-[0.18em] text-foreground uppercase">
              {projectMeta.projectName}
            </p>
            <p>{`Temporary inbox control plane · ${projectMeta.license} licensed`}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {footerLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};
