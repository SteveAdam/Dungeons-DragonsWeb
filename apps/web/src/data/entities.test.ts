import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { fakeQuery } from '../test/fakeQuery';
import { addLink, createEntity, listEntities, listLinks, moveFolder } from './entities';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const row = {
  id: 'e1',
  campaign_id: 'c1',
  type: 'npc',
  name: 'Mira',
  folder_id: null,
  visible_to_players: false,
  sort_order: 0,
  created_at: '',
  updated_at: '',
};
const from = (result: { data: unknown; error: unknown }) => {
  const q = fakeQuery(result);
  vi.mocked(supabase.from).mockReturnValueOnce(q as never);
  return q;
};
beforeEach(() => vi.clearAllMocks());

describe('reads', () => {
  it('asks for hidden entities and links only when told to', async () => {
    const dm = from({ data: [row], error: null });
    expect(await listEntities('c1', { includeHidden: true })).toEqual([
      { id: 'e1', campaignId: 'c1', type: 'npc', name: 'Mira', folderId: null, visibleToPlayers: false, sortOrder: 0 },
    ]);
    expect(dm.eq).not.toHaveBeenCalledWith('visible_to_players', true);
    const player = from({ data: [], error: null });
    await listEntities('c1', { includeHidden: false });
    expect(player.eq).toHaveBeenCalledWith('visible_to_players', true);
    const links = from({ data: [], error: null });
    await listLinks('c1', { includeHidden: false });
    expect(links.eq).toHaveBeenCalledWith('hidden', false);
  });
});

describe('writes go through the DM-only functions', () => {
  it('creates an entity with a trimmed name', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: row, error: null } as never);
    await createEntity('c1', { type: 'npc', name: '  Mira ' });
    expect(supabase.rpc).toHaveBeenCalledWith('create_entity', {
      p_campaign: 'c1',
      p_type: 'npc',
      p_name: 'Mira',
      p_folder: null,
      p_visible: false,
    });
  });

  it('says plainly when a name is taken or a relationship exists', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    } as never);
    await expect(createEntity('c1', { type: 'npc', name: 'Mira' })).rejects.toMatchObject({
      kind: 'validation',
      message: 'There is already an entity called "Mira" in this campaign.',
    });
    await expect(
      addLink({ fromId: 'a', toId: 'b', label: 'owns', reverseLabel: 'is owned by', hidden: false }),
    ).rejects.toMatchObject({ message: 'That relationship already exists between these two.' });
  });

  it('refuses empty labels and self-links before calling the server', async () => {
    await expect(
      addLink({ fromId: 'a', toId: 'a', label: 'x', reverseLabel: 'y', hidden: false }),
    ).rejects.toMatchObject({
      kind: 'validation',
    });
    await expect(
      addLink({ fromId: 'a', toId: 'b', label: ' ', reverseLabel: 'y', hidden: false }),
    ).rejects.toMatchObject({
      kind: 'validation',
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('explains a folder loop', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'A folder cannot go inside itself or one of its own subfolders' },
    } as never);
    await expect(moveFolder('f1', 'f2')).rejects.toMatchObject({
      kind: 'validation',
      message: 'A folder cannot go inside itself or one of its own subfolders.',
    });
  });
});
