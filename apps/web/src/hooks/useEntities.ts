import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addLink,
  createEntity,
  createFolder,
  deleteEntity,
  deleteFolder,
  listEntities,
  listFolders,
  listLinks,
  moveEntity,
  moveFolder,
  removeLink,
  renameEntity,
  renameFolder,
  setEntityVisibility,
  setLinkHidden,
  type Entity,
  type EntityType,
} from '../data/entities';
import { queryKeys } from './queryKeys';

/** Entities; hidden ones only in DM mode (includeHidden), so a DM previewing as a player asks as a player. */
export const useEntities = (campaignId: string, includeHidden: boolean) =>
  useQuery({
    queryKey: queryKeys.entities(campaignId, includeHidden),
    queryFn: () => listEntities(campaignId, { includeHidden }),
    enabled: !!campaignId,
  });

/** DM mode only: pass enabled=false otherwise, so the request is never made. */
export const useEntityFolders = (campaignId: string, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.entityFolders(campaignId),
    queryFn: () => listFolders(campaignId),
    enabled: enabled && !!campaignId,
  });

export const useEntityLinks = (campaignId: string, includeHidden: boolean) =>
  useQuery({
    queryKey: queryKeys.entityLinks(campaignId, includeHidden),
    queryFn: () => listLinks(campaignId, { includeHidden }),
    enabled: !!campaignId,
  });

/** Every registry write refreshes the registry (entities, folders and links share one key prefix). */
function useRegistryMutation<A, R>(campaignId: string, fn: (args: A) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.registry(campaignId) }),
  });
}

export const useCreateEntity = (campaignId: string) =>
  useRegistryMutation(campaignId, (input: { type: EntityType; name: string; folderId?: string | null }) =>
    createEntity(campaignId, input),
  );

export const useRenameEntity = (campaignId: string) =>
  useRegistryMutation(campaignId, ({ id, name }: { id: string; name: string }) => renameEntity(id, name));

export const useDeleteEntity = (campaignId: string) =>
  useRegistryMutation(campaignId, (id: string) => deleteEntity(id));

/** Moves an entity; the list updates at once and rolls back if the move fails. */
export function useMoveEntity(campaignId: string) {
  const client = useQueryClient();
  const key = queryKeys.entities(campaignId, true);
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) => moveEntity(id, folderId),
    onMutate: async ({ id, folderId }) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<Entity[]>(key);
      client.setQueryData<Entity[]>(key, list => list?.map(e => (e.id === id ? { ...e, folderId } : e)));
      return { before };
    },
    onError: (_e, _v, context) => client.setQueryData(key, context?.before),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.registry(campaignId) }),
  });
}

export const useSetEntityVisibility = (campaignId: string) =>
  useRegistryMutation(campaignId, ({ id, visible }: { id: string; visible: boolean }) =>
    setEntityVisibility(id, visible),
  );

export const useCreateFolder = (campaignId: string) =>
  useRegistryMutation(campaignId, ({ name, parentId }: { name: string; parentId: string | null }) =>
    createFolder(campaignId, name, parentId),
  );

export const useRenameFolder = (campaignId: string) =>
  useRegistryMutation(campaignId, ({ id, name }: { id: string; name: string }) => renameFolder(id, name));

export const useMoveFolder = (campaignId: string) =>
  useRegistryMutation(campaignId, ({ id, parentId }: { id: string; parentId: string | null }) =>
    moveFolder(id, parentId),
  );

export const useDeleteFolder = (campaignId: string) =>
  useRegistryMutation(campaignId, (id: string) => deleteFolder(id));

export const useAddLink = (campaignId: string) =>
  useRegistryMutation(campaignId, (input: Parameters<typeof addLink>[0]) => addLink(input));

export const useRemoveLink = (campaignId: string) => useRegistryMutation(campaignId, (id: string) => removeLink(id));

export const useSetLinkHidden = (campaignId: string) =>
  useRegistryMutation(campaignId, ({ id, hidden }: { id: string; hidden: boolean }) => setLinkHidden(id, hidden));
