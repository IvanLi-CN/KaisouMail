import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { useMetaQuery } from "@/hooks/use-meta";
import { apiClient } from "@/lib/api";
import {
  browserSupportsPasskeys,
  registerPasskey,
  resolvePasskeySupportState,
  signInWithPasskey,
} from "@/lib/passkeys";

export const passkeyListKey = ["passkeys"] as const;

export const usePasskeysQuery = (enabled = true) =>
  useQuery({
    queryKey: passkeyListKey,
    queryFn: () => apiClient.listPasskeys(),
    enabled,
  });

export const useCreatePasskeyMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => registerPasskey(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: passkeyListKey });
    },
  });
};

export const useRevokePasskeyMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (passkeyId: string) => apiClient.revokePasskey(passkeyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: passkeyListKey });
    },
  });
};

export const usePasskeyLoginMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => signInWithPasskey(),
    onSuccess: (session) => {
      queryClient.setQueryData(["session"], session);
    },
  });
};

export const usePasskeySupport = () => {
  const metaQuery = useMetaQuery();
  const browserSupported = useMemo(() => browserSupportsPasskeys(), []);

  return useMemo(
    () =>
      resolvePasskeySupportState({
        browserSupported,
        passkeyAuthEnabled: metaQuery.data?.passkeyAuthEnabled,
        isMetaLoading: metaQuery.isLoading && metaQuery.data === undefined,
        hasMetaError: Boolean(metaQuery.error) && metaQuery.data === undefined,
      }),
    [browserSupported, metaQuery.data, metaQuery.error, metaQuery.isLoading],
  );
};
