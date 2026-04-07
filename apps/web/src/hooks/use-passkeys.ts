import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { apiClient } from "@/lib/api";
import {
  browserSupportsPasskeys,
  registerPasskey,
  signInWithPasskey,
} from "@/lib/passkeys";

export const passkeyListKey = ["passkeys"] as const;

export const usePasskeysQuery = () =>
  useQuery({
    queryKey: passkeyListKey,
    queryFn: () => apiClient.listPasskeys(),
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

export const usePasskeySupport = () =>
  useMemo(() => browserSupportsPasskeys(), []);
