import { startRegistration } from "@simplewebauthn/browser";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AuthShell } from "@/components/auth/auth-shell";
import type { CompleteRegistrationValues } from "@/components/auth/register-complete-card";
import { RegisterCompleteCard } from "@/components/auth/register-complete-card";
import { useSessionQuery } from "@/hooks/use-session";
import { apiClient } from "@/lib/api";
import type { PendingRegistration } from "@/lib/contracts";
import { getPasskeyErrorMessage } from "@/lib/passkeys";

const fallbackRegistration = (
  token: string,
  error: string | null,
): PendingRegistration => ({
  token,
  method: "github",
  sourceIntent: "register",
  redirectTo: "/workspace",
  inviteRequired: false,
  invitePrevalidated: false,
  canComplete: false,
  suggestedNickname: null,
  error,
});

export const RegisterCompletePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionQuery = useSessionQuery();
  const token = searchParams.get("token") ?? "";
  const [submitError, setSubmitError] = useState<string | null>(null);

  const pendingQuery = useQuery({
    queryKey: ["auth", "registration", token],
    queryFn: () => apiClient.getPendingRegistration(token),
    enabled: token.length > 0,
  });

  const completeExternalMutation = useMutation({
    mutationFn: (values: CompleteRegistrationValues) =>
      apiClient.completeExternalRegistration({
        token,
        nickname: values.nickname,
        inviteCode: values.inviteCode,
      }),
  });

  const completePasskeyMutation = useMutation({
    mutationFn: async (values: CompleteRegistrationValues) => {
      const options =
        await apiClient.createPasskeyRegistrationCompletionOptions({
          token,
          nickname: values.nickname,
          inviteCode: values.inviteCode,
          passkeyName: values.passkeyName || "Primary Passkey",
        });
      const response = await startRegistration({
        optionsJSON: options,
      });
      return apiClient.verifyPasskeyRegistrationCompletion(response);
    },
  });

  if (sessionQuery.data?.user) {
    return <Navigate to="/workspace" replace />;
  }

  const registration = pendingQuery.data?.registration;
  const displayRegistration = (registration ??
    fallbackRegistration(
      token,
      pendingQuery.isError
        ? pendingQuery.error instanceof Error
          ? pendingQuery.error.message
          : "注册状态已失效"
        : "正在加载注册状态…",
    )) as PendingRegistration;
  if (!token) {
    return <Navigate to="/register" replace />;
  }

  return (
    <AuthShell mode="register-complete">
      <RegisterCompleteCard
        registration={displayRegistration}
        error={submitError}
        isPending={
          pendingQuery.isFetching ||
          completeExternalMutation.isPending ||
          completePasskeyMutation.isPending
        }
        onSubmit={async (values) => {
          setSubmitError(null);
          try {
            if (registration?.method === "passkey") {
              await completePasskeyMutation.mutateAsync(values);
            } else {
              await completeExternalMutation.mutateAsync(values);
            }
            navigate(registration?.redirectTo ?? "/workspace", {
              replace: true,
            });
          } catch (reason) {
            setSubmitError(
              displayRegistration.method === "passkey"
                ? getPasskeyErrorMessage(reason, "Passkey 注册失败")
                : reason instanceof Error
                  ? reason.message
                  : "注册失败",
            );
          }
        }}
      />
    </AuthShell>
  );
};
