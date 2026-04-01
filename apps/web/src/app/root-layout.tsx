import { Navigate, Outlet, useLocation } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import {
  useLogoutMutation,
  useSessionQuery,
  useVersionQuery,
} from "@/hooks/use-session";

export const RootLayout = () => {
  const location = useLocation();
  const sessionQuery = useSessionQuery();
  const versionQuery = useVersionQuery();
  const logoutMutation = useLogoutMutation();

  if (sessionQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        正在恢复会话…
      </div>
    );
  }

  if (!sessionQuery.data?.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <AppShell
      user={sessionQuery.data.user}
      version={versionQuery.data}
      onLogout={() => logoutMutation.mutate()}
    >
      <Outlet />
    </AppShell>
  );
};
