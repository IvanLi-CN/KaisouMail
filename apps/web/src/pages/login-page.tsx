import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginCard } from "@/components/auth/login-card";
import {
  usePasskeyLoginMutation,
  usePasskeySupport,
} from "@/hooks/use-passkeys";
import { useSessionQuery } from "@/hooks/use-session";
import { apiClient } from "@/lib/api";
import { handOffAuthNavigation } from "@/lib/auth-feedback";
import { getPasskeyErrorMessage } from "@/lib/passkeys";
import { appRoutes } from "@/lib/routes";

export const LoginPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const sessionQuery = useSessionQuery();
  const passkeyLoginMutation = usePasskeyLoginMutation();
  const passkeySupport = usePasskeySupport();
  const providersQuery = useQuery({
    queryKey: ["auth", "providers"],
    queryFn: () => apiClient.listAuthProviders(),
  });
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const redirectTarget =
    typeof location.state?.from === "string" &&
    location.state.from.startsWith("/") &&
    location.state.from !== "/login"
      ? location.state.from
      : "/workspace";
  const providerIntentReturnTo = useMemo(
    () => (redirectTarget === "/workspace" ? undefined : redirectTarget),
    [redirectTarget],
  );
  const searchParams = new URLSearchParams(location.search);

  if (searchParams.get("token")) {
    return (
      <Navigate
        to={`/register/complete?token=${encodeURIComponent(searchParams.get("token") ?? "")}`}
        replace
      />
    );
  }

  if (sessionQuery.data?.user) {
    return <Navigate to={redirectTarget} replace />;
  }

  return (
    <AuthShell mode="login">
      <LoginCard
        providers={providersQuery.data ?? []}
        isPasskeyPending={passkeyLoginMutation.isPending}
        passkeyError={passkeyError}
        passkeyButtonLabel={passkeySupport.buttonLabel}
        passkeySupported={passkeySupport.supported}
        passkeySupportMessage={passkeySupport.message}
        onPasskeySubmit={async () => {
          setPasskeyError(null);
          try {
            await passkeyLoginMutation.mutateAsync();
          } catch (reason) {
            setPasskeyError(getPasskeyErrorMessage(reason, "Passkey 登录失败"));
          }
        }}
        onProviderLogin={async (provider) => {
          return handOffAuthNavigation(() => {
            window.location.assign(
              apiClient.getProviderStartUrl(provider, {
                intent: "login",
                returnTo: providerIntentReturnTo,
              }),
            );
          });
        }}
        onApiKeyLogin={() =>
          handOffAuthNavigation(() => {
            navigate(appRoutes.loginApiKey);
          })
        }
      />
    </AuthShell>
  );
};
