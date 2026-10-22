// Pure helpers for the entity registry screen: the folder tree, and reading a relationship from either end.
import type { Entity, EntityFolder, EntityLink } from '../data/entities';

export interface FolderNode {
  folder: EntityFolder;
  children: FolderNode[];
  depth: number;
}

/** Folders as a tree, siblings in their sort order then by name. Orphans (a parent not loaded) go to the top. */
export function folderTree(folders: readonly EntityFolder[]): FolderNode[] {
  const ids = new Set(folders.map(f => f.id));
  const byParent = new Map<string | null, EntityFolder[]>();
  for (const f of folders) {
    const parent = f.parentId && ids.has(f.parentId) ? f.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), f]);
  }
  const build = (parent: string | null, depth: number): FolderNode[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(folder => ({ folder, depth, children: build(folder.id, depth + 1) }));
  return build(null, 0);
}

/** Every folder in tree order, with its depth: for "Move to..." lists. */
export function flattenTree(nodes: readonly FolderNode[]): FolderNode[] {
  return nodes.flatMap(n => [n, ...flattenTree(n.children)]);
}

/** A folder and everything below it: a folder cannot move into any of these. */
export function descendantIds(folderId: string, folders: readonly EntityFolder[]): Set<string> {
  const out = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

export interface LinkFromHere {
  link: EntityLink;
  /** The entity at the other end. */
  otherId: string;
  /** How the relationship reads from this entity's side. */
  label: string;
}

/** The relationships of one entity, each read from its own side. */
export function linksOf(entityId: string, links: readonly EntityLink[]): LinkFromHere[] {
  return links
    .filter(l => l.aId === entityId || l.bId === entityId)
    .map(link =>
      link.aId === entityId
        ? { link, otherId: link.bId, label: link.labelAb }
        : { link, otherId: link.aId, label: link.labelBa },
    );
}

/** Entities matching a search and a type filter, in name order. */
export function filterEntities(entities: readonly Entity[], query: string, type: Entity['type'] | 'all'): Entity[] {
  const q = query.trim().toLowerCase();
  return entities
    .filter(e => (type === 'all' || e.type === type) && (!q || e.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type DragItem = { kind: 'entity' | 'folder'; id: string };
export type DropAction =
  | { kind: 'move-entity'; id: string; folderId: string | null }
  | { kind: 'move-folder'; id: string; parentId: string | null }
  | { kind: 'refuse'; reason: string }
  | { kind: 'none' };

/** Drop targets are "folder:<id>" for a folder and "root" for the top level. */
export const ROOT_TARGET = 'root';
export const folderTarget = (id: string) => `folder:${id}`;

/** What dropping a dragged entity or folder onto a target means. */
export function resolveDrop(item: DragItem, overId: string | null, folders: readonly EntityFolder[]): DropAction {
  if (!overId) return { kind: 'none' };
  const target = overId === ROOT_TARGET ? null : overId.startsWith('folder:') ? overId.slice(7) : undefined;
  if (target === undefined) return { kind: 'none' };
  if (item.kind === 'entity') return { kind: 'move-entity', id: item.id, folderId: target };
  if (target !== null && descendantIds(item.id, folders).has(target)) {
    return { kind: 'refuse', reason: 'A folder cannot go inside itself or one of its own subfolders.' };
  }
  const current = folders.find(f => f.id === item.id)?.parentId ?? null;
  return current === target ? { kind: 'none' } : { kind: 'move-folder', id: item.id, parentId: target };
}
