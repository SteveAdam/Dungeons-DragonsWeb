import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteCustomContent, listCustomContent, saveCustomContent, type CustomDraft } from '../data/customContent';
import { queryKeys } from './queryKeys';

export const useCustomContent = (campaignId: string) =>
  useQuery({ queryKey: queryKeys.customContent(campaignId), queryFn: () => listCustomContent(campaignId) });

export function useSaveCustomContent(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: CustomDraft) => saveCustomContent(draft),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.customContent(campaignId) }),
  });
}

export function useDeleteCustomContent(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCustomContent(id),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.customContent(campaignId) }),
  });
}
