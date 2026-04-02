import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { LoginCard } from "@/components/auth/login-card";
import { useLoginMutation, useSessionQuery } from "@/hooks/use-session";

export const LoginPage = () => {
  const location = useLocation();
  const sessionQuery = useSessionQuery();
  const loginMutation = useLoginMutation();
  const [error, setError] = useState<string | null>(null);
  const redirectTarget =
    typeof location.state?.from === "string" &&
    location.state.from.startsWith("/") &&
    location.state.from !== "/login"
      ? location.state.from
      : "/workspace";

  if (sessionQuery.data?.user) {
    return <Navigate to={redirectTarget} replace />;
  }

  return (
    <div className="mx-auto grid min-h-screen max-w-[1180px] items-center gap-10 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_480px]">
      <div className="space-y-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Control plane
        </p>
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Cloudflare 临时邮箱控制台
          </h1>
          <p className="max-w-xl text-sm leading-7 text-muted-foreground">
            面向工具使用场景设计：创建临时邮箱、收件解析、查看
            HTML/文本/附件详情，并按 TTL 自动销毁。
          </p>
        </div>
      </div>
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
