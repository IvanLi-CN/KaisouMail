import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterCard } from "@/components/auth/register-card";
import { usePasskeySupport } from "@/hooks/use-passkeys";
import { useSessionQuery } from "@/hooks/use-session";
import { apiClient } from "@/lib/api";

export const RegisterPage = () => {
  const location = useLocation();
  const sessionQuery = useSessionQuery();
  const passkeySupport = usePasskeySupport();
  const searchParams = new URLSearchParams(location.search);
  const providersQuery = useQuery({
    queryKey: ["auth", "providers"],
    queryFn: () => apiClient.listAuthProviders(),
  });
  const [registerError, setRegisterError] = useState<string | null>(
    searchParams.get("error"),
  );
  const redirectTarget =
    typeof location.state?.from === "string" &&
    location.state.from.startsWith("/") &&
    location.state.from !== "/register"
      ? location.state.from
      : "/workspace";

  if (sessionQuery.data?.user) {
    return <Navigate to={redirectTarget} replace />;
  }

  return (
    <AuthShell mode="register">
      <RegisterCard
        providers={providersQuery.data ?? []}
        passkeySupported={passkeySupport.supported}
        passkeySupportMessage={passkeySupport.message}
        isPending={providersQuery.isFetching}
        error={registerError}
        onProviderRegister={async (provider, values) => {
          setRegisterError(null);
          try {
            const result = await apiClient.startProviderRegistration(provider, {
              inviteCode: values.inviteCode,
              returnTo: redirectTarget,
            });
            window.location.href = result.startUrl;
          } catch (reason) {
            setRegisterError(
              reason instanceof Error ? reason.message : "注册入口暂时不可用",
            );
          }
        }}
        onPasskeyStart={async (values) => {
          setRegisterError(null);
          try {
            const result = await apiClient.startPasskeyRegistration({
              inviteCode: values.inviteCode,
            });
            window.location.href = `/register/complete?token=${encodeURIComponent(result.registration.token)}`;
          } catch (reason) {
            setRegisterError(
              reason instanceof Error
                ? reason.message
                : "Passkey 注册入口暂时不可用",
            );
          }
        }}
      />
    </AuthShell>
  );
};
