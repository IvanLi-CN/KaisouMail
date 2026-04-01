import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";

const usersKey = ["users"] as const;

export const useUsersQuery = () =>
  useQuery({
    queryKey: usersKey,
    queryFn: () => apiClient.listUsers(),
  });

export const useCreateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.createUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKey });
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
};
