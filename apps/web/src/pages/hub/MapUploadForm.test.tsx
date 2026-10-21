import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataError } from '../../data/errors';
import * as mapsApi from '../../data/maps';
import * as storage from '../../lib/storage';
import { MapUploadForm } from './MapUploadForm';

vi.mock('../../data/maps');
// real validation and downscale decision; fake measuring, shrinking and the bucket
vi.mock('../../lib/storage', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/storage')>()),
  readImageDimensions: vi.fn(),
  downscaleImage: vi.fn(),
  mapImageStore: { upload: vi.fn(), getUrl: vi.fn(), remove: vi.fn() },
}));

const png = (name = 'Sword Coast.png') => new File(['png'], name, { type: 'image/png' });
const created = { id: 'm9' } as mapsApi.CampaignMap;

function renderForm() {
  const onUploaded = vi.fn();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MapUploadForm campaignId="c1" onUploaded={onUploaded} onCancel={() => {}} />
    </QueryClientProvider>,
  );
  return { onUploaded, user: userEvent.setup() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(storage.mapImageStore.upload).mockImplementation(async (_c, file) => ({
    path: `c1/${file.name}`,
    width: 4000,
    height: 3000,
  }));
  vi.mocked(storage.mapImageStore.remove).mockResolvedValue();
  vi.mocked(mapsApi.createMap).mockResolvedValue(created);
});

describe('map upload', () => {
  it('uploads a normal image, names the map after the file, and stores the size', async () => {
    vi.mocked(storage.readImageDimensions).mockResolvedValue({ width: 2000, height: 1500 });
    const { onUploaded, user } = renderForm();
    await user.upload(screen.getByLabelText(/Map image/), png());
    expect(await screen.findByRole('textbox', { name: 'Map name' })).toHaveValue('Sword Coast');
    expect(screen.queryByRole('group', { name: 'Image size' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: /Visible to players/ }));
    await user.click(screen.getByRole('button', { name: 'Upload map' }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(created));
    expect(mapsApi.createMap).toHaveBeenCalledWith('c1', {
      name: 'Sword Coast',
      imagePath: 'c1/Sword Coast.png',
      width: 4000,
      height: 3000,
      visibleToPlayers: true,
    });
  });

  it('offers to shrink an image wider than 4000 px, and waits for the choice', async () => {
    vi.mocked(storage.readImageDimensions).mockResolvedValue({ width: 8000, height: 6000 });
    const shrunk = png('small.png');
    vi.mocked(storage.downscaleImage).mockResolvedValue(shrunk);
    const { onUploaded, user } = renderForm();
    await user.upload(screen.getByLabelText(/Map image/), png());

    expect(await screen.findByText(/This map is 8000 × 6000 px/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload map' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Shrink to 4000 × 3000' }));
    expect(storage.downscaleImage).toHaveBeenCalledWith(expect.any(File), { width: 4000, height: 3000 });
    await user.click(await screen.findByRole('button', { name: 'Upload map' }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(storage.mapImageStore.upload).toHaveBeenCalledWith('c1', shrunk);
  });

  it('can keep the full size instead', async () => {
    vi.mocked(storage.readImageDimensions).mockResolvedValue({ width: 8000, height: 6000 });
    const { onUploaded, user } = renderForm();
    const original = png();
    await user.upload(screen.getByLabelText(/Map image/), original);
    await user.click(await screen.findByRole('button', { name: 'Keep full size' }));
    await user.click(screen.getByRole('button', { name: 'Upload map' }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(storage.downscaleImage).not.toHaveBeenCalled();
    expect(storage.mapImageStore.upload).toHaveBeenCalledWith('c1', original);
  });

  it('refuses a file that is not a map image, without uploading', async () => {
    renderForm();
    const user = userEvent.setup({ applyAccept: false }); // let the GIF past the input's accept filter
    await user.upload(screen.getByLabelText(/Map image/), new File(['gif'], 'map.gif', { type: 'image/gif' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not a map image');
    expect(screen.getByRole('button', { name: 'Upload map' })).toBeDisabled();
    expect(storage.mapImageStore.upload).not.toHaveBeenCalled();
  });

  it('removes the uploaded image again if the map cannot be created', async () => {
    vi.mocked(storage.readImageDimensions).mockResolvedValue({ width: 2000, height: 1500 });
    vi.mocked(mapsApi.createMap).mockRejectedValue(new DataError('forbidden'));
    const { onUploaded, user } = renderForm();
    await user.upload(screen.getByLabelText(/Map image/), png());
    await user.click(await screen.findByRole('button', { name: 'Upload map' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You are not allowed to do that.');
    expect(storage.mapImageStore.remove).toHaveBeenCalledWith('c1/Sword Coast.png');
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('still shows the real error when the cleanup fails too', async () => {
    vi.mocked(storage.readImageDimensions).mockResolvedValue({ width: 2000, height: 1500 });
    vi.mocked(mapsApi.createMap).mockRejectedValue(new DataError('forbidden'));
    vi.mocked(storage.mapImageStore.remove).mockRejectedValue(new Error('network down'));
    const { user } = renderForm();
    await user.upload(screen.getByLabelText(/Map image/), png());
    await user.click(await screen.findByRole('button', { name: 'Upload map' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You are not allowed to do that.');
  });
});
