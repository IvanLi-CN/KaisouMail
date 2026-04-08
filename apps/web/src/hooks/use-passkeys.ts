import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { useMetaQuery } from "@/hooks/use-meta";
import { sessionKeys, useSessionQuery } from "@/hooks/use-session";
import { apiClient, resolveApiOrigin } from "@/lib/api";
import type { SessionResponse } from "@/lib/contracts";
import {
  browserSupportsPasskeys,
  registerPasskey,
  resolvePasskeySupportState,
  signInWithPasskey,
} from "@/lib/passkeys";

export const passkeyListKey = (userId: string | null) =>
  ["passkeys", userId ?? "anonymous"] as const;

const resolveCurrentUserPasskeyListKey = (
  queryClient: ReturnType<typeof useQueryClient>,
) => {
  const session = queryClient.getQueryData<SessionResponse | null>(
    sessionKeys.all,
  );
  return passkeyListKey(session?.user.id ?? null);
};

export const usePasskeysQuery = (enabled = true) => {
  const sessionQuery = useSessionQuery();
  const userId = sessionQuery.data?.user.id ?? null;

  return useQuery({
    queryKey: passkeyListKey(userId),
    queryFn: () => apiClient.listPasskeys(),
    enabled: enabled && Boolean(userId),
  });
};

export const useCreatePasskeyMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => registerPasskey(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: resolveCurrentUserPasskeyListKey(queryClient),
      });
    },
  });
};

export const useRevokePasskeyMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (passkeyId: string) => apiClient.revokePasskey(passkeyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: resolveCurrentUserPasskeyListKey(queryClient),
      });
    },
  });
};

export const usePasskeyLoginMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => signInWithPasskey(),
    onSuccess: (session) => {
      queryClient.setQueryData(sessionKeys.all, session);
    },
  });
};

export const usePasskeySupport = () => {
  const metaQuery = useMetaQuery();
  const browserSupported = useMemo(() => browserSupportsPasskeys(), []);

  return useMemo(
    () =>
      resolvePasskeySupportState({
        apiOrigin: resolveApiOrigin(),
        browserSupported,
        passkeyAuthEnabled: metaQuery.data?.passkeyAuthEnabled,
        passkeyTrustedOrigins: metaQuery.data?.passkeyTrustedOrigins,
        isMetaLoading: metaQuery.isLoading && metaQuery.data === undefined,
        hasMetaError: Boolean(metaQuery.error) && metaQuery.data === undefined,
      }),
    [browserSupported, metaQuery.data, metaQuery.error, metaQuery.isLoading],
  );
};
