import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ApiKeyLoginCard } from "@/components/auth/api-key-login-card";
import { AuthShell } from "@/components/auth/auth-shell";
import { useLoginMutation, useSessionQuery } from "@/hooks/use-session";

export const LoginApiKeyPage = () => {
  const location = useLocation();
  const sessionQuery = useSessionQuery();
  const loginMutation = useLoginMutation();
  const [error, setError] = useState<string | null>(null);
  const redirectTarget =
    typeof location.state?.from === "string" &&
    location.state.from.startsWith("/") &&
    location.state.from !== "/login" &&
    location.state.from !== "/login/api-key"
      ? location.state.from
      : "/workspace";

  if (sessionQuery.data?.user) {
    return <Navigate to={redirectTarget} replace />;
  }

  return (
    <AuthShell mode="login">
      <ApiKeyLoginCard
        error={error}
        isPending={loginMutation.isPending}
        onSubmit={async ({ apiKey }) => {
          setError(null);
          try {
            await loginMutation.mutateAsync(apiKey);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "登录失败");
          }
        }}
      />
    </AuthShell>
  );
};
