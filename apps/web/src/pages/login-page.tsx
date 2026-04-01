import { useState } from "react";
import { Navigate } from "react-router-dom";

import { LoginCard } from "@/components/auth/login-card";
import { useLoginMutation, useSessionQuery } from "@/hooks/use-session";

export const LoginPage = () => {
  const sessionQuery = useSessionQuery();
  const loginMutation = useLoginMutation();
  const [error, setError] = useState<string | null>(null);

  if (sessionQuery.data?.user) {
    return <Navigate to="/mailboxes" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <LoginCard
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
    </div>
  );
};
