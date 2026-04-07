import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import {
  useLogoutMutation,
  useSessionQuery,
  useVersionQuery,
} from "@/hooks/use-session";
import { getErrorDetails, isPermissionError } from "@/lib/error-utils";
import { appRoutes } from "@/lib/routes";

export const RootLayout = () => {
  const location = useLocation();
  const sessionQuery = useSessionQuery();
  const versionQuery = useVersionQuery();
  const logoutMutation = useLogoutMutation();
  const sessionUser = sessionQuery.data?.user;
  const hasResolvedSession = sessionQuery.data !== undefined;

  if (sessionQuery.isLoading && !hasResolvedSession) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        正在恢复会话…
      </div>
    );
  }

  if (!sessionUser) {
    if (
      sessionQuery.error &&
      !hasResolvedSession &&
      !isPermissionError(sessionQuery.error)
    ) {
      return (
        <ErrorState
          variant="recoverable"
          layout="fullScreen"
          title="会话恢复失败"
          description="控制台暂时无法确认你的登录状态，所以这次不会把你静默踢回登录页。你可以重试一次，或者主动回到登录页重新换取会话。"
          details={getErrorDetails(sessionQuery.error)}
          primaryAction={
            <Button onClick={() => void sessionQuery.refetch()}>
              重新恢复会话
            </Button>
          }
          secondaryAction={
            <Button asChild variant="outline">
              <Link to={appRoutes.login} state={{ from: location.pathname }}>
                回到登录页
              </Link>
            </Button>
          }
        />
      );
    }

    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <AppShell
      user={sessionUser}
      version={versionQuery.data}
      onLogout={() => logoutMutation.mutate()}
    >
      <Outlet />
    </AppShell>
  );
};
