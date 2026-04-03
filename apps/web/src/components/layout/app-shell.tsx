import {
  BriefcaseBusiness,
  Globe,
  KeyRound,
  LayoutPanelTop,
  LogOut,
  Mailbox,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { PropsWithChildren } from "react";
import { Link, matchPath, useLocation } from "react-router-dom";

import { ActionButton } from "@/components/ui/action-button";
import type { SessionUser, VersionInfo } from "@/lib/contracts";
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

export const AppShell = ({
  user,
  version,
  onLogout,
  children,
}: PropsWithChildren<{
  user: SessionUser;
  version?: VersionInfo | null;
  onLogout: () => void;
}>) => {
  const location = useLocation();
  const pathname = location.pathname === "/" ? "/workspace" : location.pathname;

  return (
    <div className="min-h-screen">
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
                    CF Mail
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
              <div className="rounded-xl border border-border bg-card px-3 py-3">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  {user.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {user.email}
                </p>
                <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Role · {user.role}
                </p>
              </div>
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

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/70 px-3 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>Manage inbox lifecycle, messages, and API access.</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>Version {version?.version ?? "dev"}</span>
              <span>{version?.commitSha ?? "local"}</span>
              <span>{version?.branch ?? "main"}</span>
            </div>
          </div>
        </div>
      </header>

      <main
        id="app-main"
        className="mx-auto min-w-0 max-w-[1520px] space-y-6 px-4 py-6 lg:px-6 xl:px-8"
      >
        {children}
      </main>
    </div>
  );
};
