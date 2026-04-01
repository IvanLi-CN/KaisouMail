import {
  KeyRound,
  Mailbox,
  ShieldCheck,
  UserRound,
  WandSparkles,
} from "lucide-react";
import type { PropsWithChildren } from "react";
import { Link, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { SessionUser, VersionInfo } from "@/lib/contracts";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Mailbox;
  adminOnly?: boolean;
};

const navItems = [
  { to: "/mailboxes", label: "邮箱", icon: Mailbox },
  { to: "/api-keys", label: "API Keys", icon: KeyRound },
  { to: "/users", label: "用户", icon: UserRound, adminOnly: true },
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
}>) => (
  <div className="min-h-screen px-4 py-6 md:px-6 xl:px-8">
    <div className="mx-auto grid max-w-[1440px] gap-6 xl:grid-cols-[280px_1fr]">
      <aside className="rounded-[32px] border border-border/70 bg-card/70 p-6 shadow-soft backdrop-blur">
        <div className="space-y-8">
          <div className="space-y-4">
            <Link to="/mailboxes" className="inline-flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <WandSparkles className="h-6 w-6" />
              </span>
              <span>
                <span className="block text-lg font-semibold">cf-mail</span>
                <span className="text-sm text-muted-foreground">
                  Cloudflare 临时邮箱台
                </span>
              </span>
            </Link>
            <div className="rounded-3xl border border-border/70 bg-background/40 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {user.name}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
              <p className="mt-3 inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-secondary-foreground">
                {user.role}
              </p>
            </div>
          </div>

          <nav className="space-y-2">
            {navItems
              .filter((item) => !item.adminOnly || user.role === "admin")
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-white/5 hover:text-foreground",
                      isActive && "bg-primary/15 text-primary",
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
          </nav>

          <div className="space-y-3">
            <Button variant="secondary" className="w-full" onClick={onLogout}>
              退出登录
            </Button>
            <div className="text-xs leading-5 text-muted-foreground">
              <p>Version {version?.version ?? "dev"}</p>
              <p>
                {version?.commitSha ?? "local"} · {version?.branch ?? "main"}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <main className="space-y-6">{children}</main>
    </div>
  </div>
);
