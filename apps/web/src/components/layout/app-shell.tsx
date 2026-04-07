import {
  BriefcaseBusiness,
  ChevronDown,
  Globe,
  KeyRound,
  LayoutPanelTop,
  LogOut,
  Mailbox,
  Menu,
  ShieldCheck,
  UserRound,
  X,
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

const renderAccountDetails = (user: SessionUser) => (
  <>
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        账号详情
      </p>
      <p className="text-sm font-semibold text-foreground">{user.name}</p>
    </div>

    <dl className="space-y-3">
      <div className="space-y-1">
        <dt className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          邮箱
        </dt>
        <dd className="break-all text-sm text-foreground">{user.email}</dd>
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
  </>
);

const isNavItemActive = (item: NavItem, pathname: string) =>
  item.activePatterns.some((pattern) =>
    Boolean(
      matchPath(
        {
          path: pattern,
          end: pattern === item.to,
        },
        pathname,
      ),
    ),
  );

const renderNavLink = ({
  item,
  pathname,
  layout,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  layout: "desktop" | "mobile";
  onNavigate?: () => void;
}) => {
  const isActive = isNavItemActive(item, pathname);
  const baseClassName =
    layout === "mobile"
      ? "flex w-full items-center gap-3 rounded-xl border border-white/8 bg-background/45 px-4 py-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      : "inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Link
      key={`${layout}-${item.to}`}
      to={item.to}
      className={cn(
        baseClassName,
        isActive
          ? "border-border bg-secondary/90 text-foreground"
          : "text-muted-foreground hover:border-border/80 hover:bg-background/65 hover:text-foreground",
      )}
      onClick={onNavigate}
    >
      <item.icon
        className={cn("shrink-0", layout === "mobile" ? "h-4 w-4" : "h-4 w-4")}
      />
      <span className="min-w-0 truncate">{item.label}</span>
    </Link>
  );
};

export const AppShell = ({
  user,
  version,
  onLogout,
  children,
  defaultAccountPopoverOpen = false,
  defaultMobileNavOpen = false,
}: PropsWithChildren<{
  user: SessionUser;
  version?: VersionInfo | null;
  onLogout: () => void;
  defaultAccountPopoverOpen?: boolean;
  defaultMobileNavOpen?: boolean;
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
  const mobileNavDrawerId = useId();
  const mobileNavDrawerTitleId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileNavCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const closePreviewTimerRef = useRef<number | null>(null);
  const hasHandledInitialPathRef = useRef(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isAccountPopoverPinned, setIsAccountPopoverPinned] = useState(
    defaultAccountPopoverOpen,
  );
  const [isAccountPopoverPreviewing, setIsAccountPopoverPreviewing] =
    useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(defaultMobileNavOpen);
  const isAccountPopoverOpen =
    isAccountPopoverPinned || isAccountPopoverPreviewing;
  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || user.role === "admin",
  );

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

  useEffect(() => {
    if (!hasHandledInitialPathRef.current) {
      hasHandledInitialPathRef.current = true;
      return;
    }

    if (pathname) {
      setIsMobileNavOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!isMobileNavOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    mobileNavCloseButtonRef.current?.focus();
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileNavOpen]);

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
    setIsMobileNavOpen(false);
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
    setIsMobileNavOpen(false);

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
          <div className="flex flex-wrap items-start gap-3 lg:flex-nowrap lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-4 lg:gap-6">
              <Link to="/workspace" className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-primary">
                  <BriefcaseBusiness className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold tracking-[0.18em] text-foreground uppercase">
                    {projectMeta.projectName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Temporary inbox control plane
                  </span>
                </span>
              </Link>

              <nav
                aria-label="主导航"
                className="hidden min-w-0 flex-1 flex-wrap items-center gap-2 lg:flex"
              >
                {visibleNavItems.map((item) =>
                  renderNavLink({
                    item,
                    pathname,
                    layout: "desktop",
                  }),
                )}
              </nav>
            </div>

            <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto lg:ml-0 lg:w-auto lg:flex-nowrap">
              <div className="hidden items-center gap-2 lg:flex">
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
                        "inline-flex min-w-0 max-w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-[12rem]",
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
                    {renderAccountDetails(user)}
                  </PopoverContent>
                </Popover>

                <ActionButton
                  density="dense"
                  icon={LogOut}
                  label="退出登录"
                  labelVisibility="desktop"
                  onClick={onLogout}
                  priority="secondary"
                  variant="outline"
                />
              </div>

              <button
                aria-controls={mobileNavDrawerId}
                aria-expanded={isMobileNavOpen}
                aria-haspopup="dialog"
                aria-label={isMobileNavOpen ? "收起导航抽屉" : "打开导航抽屉"}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors duration-200 hover:border-border/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
                onClick={() => {
                  setIsMobileNavOpen((current) => {
                    const next = !current;

                    if (next) {
                      closeAccountPopover();
                    }

                    return next;
                  });
                }}
                type="button"
              >
                {isMobileNavOpen ? (
                  <X aria-hidden className="h-4 w-4" />
                ) : (
                  <Menu aria-hidden className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {isMobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="关闭导航抽屉遮罩"
            className="absolute inset-0 bg-background/72 backdrop-blur-sm"
            onClick={() => setIsMobileNavOpen(false)}
            type="button"
          />
          <div className="pointer-events-none absolute inset-y-0 right-0 flex w-full justify-end">
            <div
              aria-labelledby={mobileNavDrawerTitleId}
              aria-modal="true"
              className="pointer-events-auto relative flex h-full w-[min(calc(100vw-3rem),21rem)] flex-col overflow-hidden border-l border-white/10 bg-[linear-gradient(180deg,rgba(8,12,20,0.82)_0%,rgba(8,12,20,0.94)_100%)] shadow-[0_28px_84px_rgba(2,6,23,0.46),0_14px_34px_rgba(2,6,23,0.32)] backdrop-blur-2xl"
              id={mobileNavDrawerId}
              role="dialog"
            >
              <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-background/24 px-4 py-4">
                <p
                  className="text-sm font-semibold text-foreground"
                  id={mobileNavDrawerTitleId}
                >
                  菜单
                </p>
                <button
                  ref={mobileNavCloseButtonRef}
                  aria-label="关闭导航抽屉"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-background/40 text-muted-foreground transition-colors duration-200 hover:border-border/80 hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setIsMobileNavOpen(false)}
                  type="button"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto bg-background/8 px-4 py-4">
                <div className="space-y-3 rounded-2xl border border-white/10 bg-background/36 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    当前账号
                  </p>
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-primary">
                      <ShieldCheck aria-hidden className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="space-y-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {user.name}
                        </p>
                        <p className="break-all text-xs text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-border bg-muted/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
                        {user.role}
                      </span>
                    </div>
                  </div>
                </div>

                <nav aria-label="移动主导航" className="space-y-2">
                  {visibleNavItems.map((item) =>
                    renderNavLink({
                      item,
                      pathname,
                      layout: "mobile",
                      onNavigate: () => setIsMobileNavOpen(false),
                    }),
                  )}
                </nav>
              </div>

              <div className="border-t border-white/10 bg-background/24 px-4 py-4">
                <ActionButton
                  className="w-full justify-center"
                  density="default"
                  forceIconOnly={false}
                  icon={LogOut}
                  label="退出登录"
                  labelVisibility="always"
                  onClick={() => {
                    setIsMobileNavOpen(false);
                    onLogout();
                  }}
                  priority="secondary"
                  variant="outline"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <main
        id="app-main"
        className="mx-auto min-w-0 w-full max-w-[1520px] flex-1 space-y-6 px-4 py-5 sm:py-6 lg:px-6 xl:px-8"
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
