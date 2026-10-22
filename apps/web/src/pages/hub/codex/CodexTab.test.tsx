import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity, EntityFolder, EntityLink } from '../../../data/entities';
import * as api from '../../../data/entities';
import { CodexTab } from './CodexTab';

vi.mock('../../../data/entities', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../data/entities')>()),
  listEntities: vi.fn(),
  listFolders: vi.fn(),
  listLinks: vi.fn(),
  createEntity: vi.fn(),
  moveEntity: vi.fn(),
  addLink: vi.fn(),
  setLinkHidden: vi.fn(),
  createFolder: vi.fn(),
  deleteFolder: vi.fn(),
  moveFolder: vi.fn(),
  renameFolder: vi.fn(),
  renameEntity: vi.fn(),
  deleteEntity: vi.fn(),
  setEntityVisibility: vi.fn(),
  removeLink: vi.fn(),
}));

const entity = (id: string, name: string, type: Entity['type'], over: Partial<Entity> = {}): Entity => ({
  id,
  campaignId: 'c1',
  type,
  name,
  folderId: null,
  visibleToPlayers: true,
  sortOrder: 0,
  ...over,
});
const mira = entity('mira', 'Mira', 'npc', { folderId: 'coast' });
const port = entity('port', 'Port Vellum', 'location');
const cult = entity('cult', 'The Drowned Cult', 'faction', { visibleToPlayers: false });
const coast: EntityFolder = { id: 'coast', campaignId: 'c1', parentId: null, name: 'Sword Coast', sortOrder: 0 };
const lives: EntityLink = {
  id: 'l1',
  aId: 'mira',
  bId: 'port',
  labelAb: 'lives in',
  labelBa: 'is home to',
  hidden: false,
};
const secret: EntityLink = {
  id: 'l2',
  aId: 'mira',
  bId: 'cult',
  labelAb: 'serves',
  labelBa: 'is served by',
  hidden: true,
};

function show(dmMode: boolean) {
  vi.mocked(api.listEntities).mockImplementation(async (_c, { includeHidden }) =>
    includeHidden ? [mira, port, cult] : [mira, port],
  );
  vi.mocked(api.listFolders).mockResolvedValue([coast]);
  vi.mocked(api.listLinks).mockImplementation(async (_c, { includeHidden }) =>
    includeHidden ? [lives, secret] : [lives],
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CodexTab campaignId="c1" dmMode={dmMode} />
    </QueryClientProvider>,
  );
}

const list = () => screen.findByRole('list', { name: 'Entities' });
beforeEach(() => vi.clearAllMocks());

describe('the DM codex', () => {
  it('lists every entity and folder, and filters by folder, type and search', async () => {
    show(true);
    const entities = await list();
    expect(
      within(entities)
        .getAllByRole('button')
        .map(b => b.textContent),
    ).toEqual(['MiraNPC', 'Port VellumLocation', 'The Drowned CultFaction· hidden']);
    const folders = screen.getByRole('navigation', { name: 'Folders' });
    await userEvent.click(within(folders).getByRole('button', { name: /Sword Coast/ }));
    expect(
      within(entities)
        .getAllByRole('button')
        .map(b => b.textContent),
    ).toEqual(['MiraNPC']);
    await userEvent.click(within(folders).getByRole('button', { name: /All entities/ }));
    await userEvent.selectOptions(screen.getAllByRole('combobox', { name: 'Type' })[0], 'location');
    expect(
      within(entities)
        .getAllByRole('button')
        .map(b => b.textContent),
    ).toEqual(['Port VellumLocation']);
  });

  it('shows each relationship from its own side, with a different label at each end', async () => {
    show(true);
    const entities = await list();
    await userEvent.click(within(entities).getByRole('button', { name: /^Mira/ }));
    expect(screen.getByRole('button', { name: 'Mira lives in Port Vellum: open Port Vellum' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mira serves The Drowned Cult: open The Drowned Cult' }),
    ).toBeInTheDocument();
    // follow the link to the other end: it reads the other way round
    await userEvent.click(screen.getByRole('button', { name: 'Mira lives in Port Vellum: open Port Vellum' }));
    expect(screen.getByRole('button', { name: 'Port Vellum is home to Mira: open Mira' })).toBeInTheDocument();
  });

  it('adds a relationship with a label for each side, and hides or reveals one', async () => {
    show(true);
    vi.mocked(api.addLink).mockResolvedValue({ ...lives, id: 'l3' });
    vi.mocked(api.setLinkHidden).mockResolvedValue({ ...secret, hidden: false });
    const user = userEvent.setup();
    await user.click(within(await list()).getByRole('button', { name: /^Port Vellum/ }));
    const form = screen.getByRole('form', { name: 'Add a relationship' });
    await user.selectOptions(within(form).getByRole('combobox', { name: 'With' }), 'cult');
    await user.type(within(form).getByRole('textbox', { name: 'Port Vellum …' }), 'hides');
    await user.type(within(form).getByRole('textbox', { name: 'The Drowned Cult …' }), 'hides in');
    await user.click(within(form).getByRole('switch', { name: 'Hidden from players' }));
    await user.click(within(form).getByRole('button', { name: 'Add relationship' }));
    expect(api.addLink).toHaveBeenCalledWith({
      fromId: 'port',
      toId: 'cult',
      label: 'hides',
      reverseLabel: 'hides in',
      hidden: true,
    });

    await user.click(within(await list()).getByRole('button', { name: /^Mira/ }));
    await user.click(screen.getByRole('button', { name: 'Reveal: Mira serves The Drowned Cult' }));
    expect(api.setLinkHidden).toHaveBeenCalledWith('l2', false);
  });

  it('moves an entity with the keyboard-friendly "Move to…" list', async () => {
    show(true);
    vi.mocked(api.moveEntity).mockResolvedValue({ ...port, folderId: 'coast' });
    const user = userEvent.setup();
    await user.click(within(await list()).getByRole('button', { name: /^Port Vellum/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Move to…' }), 'coast');
    expect(api.moveEntity).toHaveBeenCalledWith('port', 'coast');
  });

  it('creates entities in the chosen folder, and folders inside folders', async () => {
    show(true);
    vi.mocked(api.createEntity).mockResolvedValue(entity('lantern', 'The Lantern', 'item', { folderId: 'coast' }));
    vi.mocked(api.createFolder).mockResolvedValue({ ...coast, id: 'port', name: 'Port Vellum', parentId: 'coast' });
    const user = userEvent.setup();
    await list();
    await user.click(
      within(screen.getByRole('navigation', { name: 'Folders' })).getByRole('button', { name: /Sword Coast/ }),
    );
    const newEntity = screen.getByRole('form', { name: 'New entity' });
    expect(within(newEntity).getByText('New entity in Sword Coast')).toBeInTheDocument();
    await user.selectOptions(within(newEntity).getByRole('combobox', { name: 'Type' }), 'item');
    await user.type(within(newEntity).getByRole('textbox', { name: 'Name' }), 'The Lantern');
    await user.click(within(newEntity).getByRole('button', { name: 'Create' }));
    expect(api.createEntity).toHaveBeenCalledWith('c1', { type: 'item', name: 'The Lantern', folderId: 'coast' });

    const newFolder = screen.getByRole('form', { name: 'New folder' });
    await user.type(within(newFolder).getByRole('textbox', { name: 'New folder inside Sword Coast' }), 'Port Vellum');
    await user.click(within(newFolder).getByRole('button', { name: 'Add folder' }));
    expect(api.createFolder).toHaveBeenCalledWith('c1', 'Port Vellum', 'coast');
  });

  it('deletes a folder only after confirming, and says its contents move up', async () => {
    show(true);
    vi.mocked(api.deleteFolder).mockResolvedValue(undefined);
    const user = userEvent.setup();
    await list();
    await user.click(
      within(screen.getByRole('navigation', { name: 'Folders' })).getByRole('button', { name: /Sword Coast/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete folder' }));
    expect(screen.getByText('Delete this folder? Everything in it moves up one level.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(api.deleteFolder).toHaveBeenCalledWith('coast'));
  });
});

describe('the player codex', () => {
  it('is a flat, searchable list of what the DM revealed, read-only, without folders or hidden links', async () => {
    show(false);
    const entities = await list();
    expect(
      within(entities)
        .getAllByRole('button')
        .map(b => b.textContent),
    ).toEqual(['MiraNPC', 'Port VellumLocation']);
    expect(api.listFolders).not.toHaveBeenCalled();
    expect(api.listEntities).toHaveBeenCalledWith('c1', { includeHidden: false });
    expect(api.listLinks).toHaveBeenCalledWith('c1', { includeHidden: false });
    expect(screen.queryByRole('navigation', { name: 'Folders' })).not.toBeInTheDocument();

    await userEvent.click(within(entities).getByRole('button', { name: /^Mira/ }));
    expect(screen.getByRole('button', { name: 'Mira lives in Port Vellum: open Port Vellum' })).toBeInTheDocument();
    expect(screen.queryByText(/Drowned Cult/)).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Add a relationship' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rename|Delete/ })).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search entities' }), 'port');
    expect(
      within(entities)
        .getAllByRole('button')
        .map(b => b.textContent),
    ).toEqual(['Port VellumLocation']);
  });
});
