import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";

const usersKey = ["users"] as const;
const invitesKey = ["admin", "invites"] as const;
const registrationSettingsKey = ["admin", "registration-settings"] as const;

export const useUsersQuery = () =>
  useQuery({
    queryKey: usersKey,
    queryFn: () => apiClient.listUsers(),
  });

export const useInvitesQuery = () =>
  useQuery({
    queryKey: invitesKey,
    queryFn: () => apiClient.listInvites(),
  });

export const useCreateInviteMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { note?: string; count: number }) =>
      apiClient.createInvite(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invitesKey });
    },
  });
};

export const useDeleteInviteMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteInvite(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invitesKey });
    },
  });
};

export const useRegistrationSettingsQuery = () =>
  useQuery({
    queryKey: registrationSettingsKey,
    queryFn: () => apiClient.getRegistrationSettings(),
  });

export const useUpdateRegistrationSettingsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.updateRegistrationSettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: registrationSettingsKey });
    },
  });
};

export const useTransferAdminMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      verificationToken,
    }: {
      userId: string;
      verificationToken: string;
    }) => apiClient.transferAdmin(userId, verificationToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKey });
      void queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
};
