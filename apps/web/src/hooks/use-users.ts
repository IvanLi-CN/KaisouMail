import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";

export const USERS_PAGE_SIZE = 10;
export const INVITES_PAGE_SIZE = 10;

const usersKey = ["users"] as const;
const invitesKey = ["admin", "invites"] as const;
const registrationSettingsKey = ["admin", "registration-settings"] as const;

export const useUsersQuery = (page: number, pageSize = USERS_PAGE_SIZE) =>
  useQuery({
    queryKey: [...usersKey, page, pageSize],
    queryFn: () => apiClient.listUsers({ page, pageSize }),
  });

export const useInvitesQuery = (page: number, pageSize = INVITES_PAGE_SIZE) =>
  useQuery({
    queryKey: [...invitesKey, page, pageSize],
    queryFn: () => apiClient.listInvites({ page, pageSize }),
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
