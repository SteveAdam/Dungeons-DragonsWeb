import { describe, expect, it } from 'vitest';
import type { Entity, EntityFolder, EntityLink } from '../data/entities';
import { descendantIds, filterEntities, flattenTree, folderTree, linksOf, resolveDrop } from './entityTree';

const folder = (id: string, parentId: string | null, name = id, sortOrder = 0): EntityFolder => ({
  id,
  campaignId: 'c1',
  parentId,
  name,
  sortOrder,
});
// Sword Coast > Port Vellum > Docks, and Underdark at the top level
const folders = [
  folder('coast', null, 'Sword Coast', 0),
  folder('port', 'coast', 'Port Vellum'),
  folder('docks', 'port', 'Docks'),
  folder('under', null, 'Underdark', 1),
];

describe('folder tree', () => {
  it('nests folders and keeps their order', () => {
    const tree = folderTree(folders);
    expect(tree.map(n => n.folder.name)).toEqual(['Sword Coast', 'Underdark']);
    expect(flattenTree(tree).map(n => `${n.depth}:${n.folder.name}`)).toEqual([
      '0:Sword Coast',
      '1:Port Vellum',
      '2:Docks',
      '0:Underdark',
    ]);
  });

  it('knows everything below a folder', () => {
    expect([...descendantIds('coast', folders)].sort()).toEqual(['coast', 'docks', 'port']);
    expect([...descendantIds('docks', folders)]).toEqual(['docks']);
  });
});

describe('relationships from each side', () => {
  const link: EntityLink = {
    id: 'l1',
    aId: 'mira',
    bId: 'lantern',
    labelAb: 'owns',
    labelBa: 'is owned by',
    hidden: false,
  };
  it('reads "owns" from one end and "is owned by" from the other', () => {
    expect(linksOf('mira', [link])).toEqual([{ link, otherId: 'lantern', label: 'owns' }]);
    expect(linksOf('lantern', [link])).toEqual([{ link, otherId: 'mira', label: 'is owned by' }]);
    expect(linksOf('someone-else', [link])).toEqual([]);
  });
});

describe('drag and drop', () => {
  it('drops an entity into a folder or onto the top level', () => {
    expect(resolveDrop({ kind: 'entity', id: 'mira' }, 'folder:port', folders)).toEqual({
      kind: 'move-entity',
      id: 'mira',
      folderId: 'port',
    });
    expect(resolveDrop({ kind: 'entity', id: 'mira' }, 'root', folders)).toEqual({
      kind: 'move-entity',
      id: 'mira',
      folderId: null,
    });
  });

  it('moves folders into folders, refuses loops, and ignores a drop where it already is', () => {
    expect(resolveDrop({ kind: 'folder', id: 'under' }, 'folder:coast', folders)).toEqual({
      kind: 'move-folder',
      id: 'under',
      parentId: 'coast',
    });
    expect(resolveDrop({ kind: 'folder', id: 'coast' }, 'folder:docks', folders)).toMatchObject({ kind: 'refuse' });
    expect(resolveDrop({ kind: 'folder', id: 'coast' }, 'folder:coast', folders)).toMatchObject({ kind: 'refuse' });
    expect(resolveDrop({ kind: 'folder', id: 'port' }, 'folder:coast', folders)).toEqual({ kind: 'none' });
    expect(resolveDrop({ kind: 'folder', id: 'port' }, 'root', folders)).toEqual({
      kind: 'move-folder',
      id: 'port',
      parentId: null,
    });
    expect(resolveDrop({ kind: 'entity', id: 'mira' }, null, folders)).toEqual({ kind: 'none' });
  });
});

describe('filterEntities', () => {
  const e = (name: string, type: Entity['type']): Entity => ({
    id: name,
    campaignId: 'c1',
    type,
    name,
    folderId: null,
    visibleToPlayers: true,
    sortOrder: 0,
  });
  it('searches by name and filters by type, in name order', () => {
    const list = [e('Port Vellum', 'location'), e('Mira', 'npc'), e('Mirror Lake', 'location')];
    expect(filterEntities(list, 'mir', 'all').map(x => x.name)).toEqual(['Mira', 'Mirror Lake']);
    expect(filterEntities(list, '', 'location').map(x => x.name)).toEqual(['Mirror Lake', 'Port Vellum']);
  });
});
