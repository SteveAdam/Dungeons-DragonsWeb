import { describe, expect, it, vi } from 'vitest';
import {
  createFakeHandoutImageStore,
  createSupabaseHandoutImageStore,
  HANDOUT_IMAGE_BUCKET,
  HANDOUT_URL_TTL_SECONDS,
  handoutImageType,
  MAX_HANDOUT_IMAGE_BYTES,
  validateHandoutImageFile,
} from './handoutImages';

function setup(uploadError: unknown = null) {
  let time = 1_000_000;
  let signed = 0;
  const bucket = {
    upload: vi.fn(async () => ({ data: { path: 'ignored' }, error: uploadError })),
    createSignedUrl: vi.fn(async (path: string) => {
      signed += 1;
      return { data: { signedUrl: `https://cdn.test/${path}?token=${signed}` }, error: null as unknown };
    }),
    remove: vi.fn(async () => ({ data: [], error: null as unknown })),
  };
  const client = { storage: { from: vi.fn(() => bucket) } };
  const store = createSupabaseHandoutImageStore(client as never, { now: () => time, newId: () => 'id-1' });
  return {
    store,
    bucket,
    client,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });

describe('handout image files', () => {
  it('accept PNG, JPG and WebP, by type or by extension', () => {
    expect(handoutImageType(file('a.png', 'image/png'))).toBe('image/png');
    expect(handoutImageType(file('a.jpeg', ''))).toBe('image/jpeg');
    expect(handoutImageType(file('a.webp', ''))).toBe('image/webp');
  });

  it('refuse other types, SVG included (it could carry script)', () => {
    expect(() => validateHandoutImageFile(file('a.svg', 'image/svg+xml'))).toThrow(/PNG, JPG or WebP/);
    expect(() => validateHandoutImageFile(file('a.gif', 'image/gif'))).toThrow(/PNG, JPG or WebP/);
    expect(() => validateHandoutImageFile(file('a.png', 'text/html'))).toThrow(/PNG, JPG or WebP/);
  });

  it('refuse empty and oversized files', () => {
    expect(() => validateHandoutImageFile(file('a.png', 'image/png', 0))).toThrow(/empty/);
    expect(() =>
      validateHandoutImageFile({ name: 'a.png', type: 'image/png', size: MAX_HANDOUT_IMAGE_BYTES + 1 }),
    ).toThrow(/at most 10 MB/);
  });
});

describe('the handout image store', () => {
  it('uploads into the campaign folder of the handouts bucket', async () => {
    const { store, bucket, client } = setup();
    expect(await store.upload('c1', file('Letter.jpg', 'image/jpeg'))).toBe('c1/id-1.jpg');
    expect(client.storage.from).toHaveBeenCalledWith(HANDOUT_IMAGE_BUCKET);
    expect(bucket.upload).toHaveBeenCalledWith('c1/id-1.jpg', expect.any(File), {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });
  });

  it('refuses a bad file before anything is sent', async () => {
    const { store, bucket } = setup();
    await expect(store.upload('c1', file('x.gif', 'image/gif'))).rejects.toMatchObject({ kind: 'validation' });
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it('turns a refused upload into a friendly error', async () => {
    const { store } = setup({ message: 'new row violates row-level security policy', statusCode: '403' });
    await expect(store.upload('c1', file('a.png', 'image/png'))).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('reuses a signed URL until shortly before it expires', async () => {
    const { store, bucket, advance } = setup();
    const first = await store.getUrl('c1/a.png');
    advance(30 * 60 * 1000);
    expect(await store.getUrl('c1/a.png')).toBe(first);
    advance(HANDOUT_URL_TTL_SECONDS * 1000);
    expect(await store.getUrl('c1/a.png')).not.toBe(first);
    expect(bucket.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('removes a file and forgets its URL', async () => {
    const { store, bucket } = setup();
    await store.getUrl('c1/a.png');
    await store.remove('c1/a.png');
    expect(bucket.remove).toHaveBeenCalledWith(['c1/a.png']);
    await store.getUrl('c1/a.png');
    expect(bucket.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('has a fake that validates like the real one', async () => {
    const fake = createFakeHandoutImageStore();
    const path = await fake.upload('c1', file('a.webp', 'image/webp'));
    expect(await fake.getUrl(path)).toBe(`fake://handouts/${path}`);
    await expect(fake.upload('c1', file('a.svg', 'image/svg+xml'))).rejects.toMatchObject({ kind: 'validation' });
  });
});
