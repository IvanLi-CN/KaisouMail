import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LoginCard } from "@/components/auth/login-card";
import { BrandLockup } from "@/components/brand/brand-lockup";
import {
  usePasskeyLoginMutation,
  usePasskeySupport,
} from "@/hooks/use-passkeys";
import { useLoginMutation, useSessionQuery } from "@/hooks/use-session";
import { getPasskeyErrorMessage } from "@/lib/passkeys";
import { projectMeta } from "@/lib/project-meta";

export const LoginPage = () => {
  const location = useLocation();
  const sessionQuery = useSessionQuery();
  const loginMutation = useLoginMutation();
  const passkeyLoginMutation = usePasskeyLoginMutation();
  const passkeySupport = usePasskeySupport();
  const [error, setError] = useState<string | null>(null);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
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
        <div className="max-w-[24rem]">
          <BrandLockup />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Control plane
        </p>
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            {projectMeta.projectName} 临时邮箱控制台
          </h1>
          <p className="max-w-xl text-sm leading-7 text-muted-foreground">
            创建临时邮箱、查看邮件内容与附件，并按 TTL 自动回收。
          </p>
        </div>
      </div>
      <LoginCard
        error={error}
        isPending={loginMutation.isPending}
        isPasskeyPending={passkeyLoginMutation.isPending}
        passkeyError={passkeyError}
        passkeyButtonLabel={passkeySupport.buttonLabel}
        passkeySupported={passkeySupport.supported}
        passkeySupportMessage={passkeySupport.message}
        onSubmit={async ({ apiKey }) => {
          setError(null);
          setPasskeyError(null);
          try {
            await loginMutation.mutateAsync(apiKey);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "登录失败");
          }
        }}
        onPasskeySubmit={async () => {
          setError(null);
          setPasskeyError(null);
          try {
            await passkeyLoginMutation.mutateAsync();
          } catch (reason) {
            setPasskeyError(getPasskeyErrorMessage(reason, "Passkey 登录失败"));
          }
        }}
      />
    </div>
  );
};
