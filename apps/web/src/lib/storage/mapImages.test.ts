import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeMapImageStore } from './fakeMapImageStore';
import {
  createSupabaseMapImageStore,
  MAP_IMAGE_BUCKET,
  SIGNED_URL_REFRESH_MARGIN_MS,
  SIGNED_URL_TTL_SECONDS,
} from './mapImages';

const HOUR = SIGNED_URL_TTL_SECONDS * 1000;

/** A stand-in for supabase.storage with a controllable clock. */
function setup() {
  let time = 1_000_000;
  let signed = 0;
  const bucket = {
    upload: vi.fn(async () => ({ data: { path: 'ignored' }, error: null as unknown })),
    createSignedUrl: vi.fn(async (path: string) => {
      signed += 1;
      return { data: { signedUrl: `https://cdn.test/${path}?token=${signed}` }, error: null as unknown };
    }),
    remove: vi.fn(async () => ({ data: [], error: null as unknown })),
  };
  const client = { storage: { from: vi.fn(() => bucket) } };
  const store = createSupabaseMapImageStore(client as never, {
    now: () => time,
    newId: () => 'id-1',
    measure: async () => ({ width: 2048, height: 1536 }),
  });
  return {
    store,
    bucket,
    client,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

const png = () => new File(['png-bytes'], 'Sword Coast.png', { type: 'image/png' });

describe('upload', () => {
  it('validates, measures and uploads into the campaign folder, returning path and size', async () => {
    const { store, bucket, client } = setup();
    expect(await store.upload('c1', png())).toEqual({ path: 'c1/id-1.png', width: 2048, height: 1536 });
    expect(client.storage.from).toHaveBeenCalledWith(MAP_IMAGE_BUCKET);
    expect(bucket.upload).toHaveBeenCalledWith('c1/id-1.png', expect.any(File), {
      contentType: 'image/png',
      cacheControl: '3600',
      upsert: false,
    });
  });

  it('refuses a bad file before anything is sent', async () => {
    const { store, bucket } = setup();
    await expect(store.upload('c1', new File(['x'], 'map.gif', { type: 'image/gif' }))).rejects.toMatchObject({
      kind: 'validation',
    });
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it('turns a refused upload (not the DM) into a friendly error', async () => {
    const { store, bucket } = setup();
    bucket.upload.mockResolvedValueOnce({
      data: null as never,
      error: { statusCode: '403', message: 'new row violates row-level security policy' },
    });
    await expect(store.upload('c1', png())).rejects.toMatchObject({ kind: 'forbidden' });
  });
});

describe('getUrl caching', () => {
  it('asks for a one-hour signed URL', async () => {
    const { store, bucket } = setup();
    expect(await store.getUrl('c1/a.png')).toBe('https://cdn.test/c1/a.png?token=1');
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('c1/a.png', 3600);
  });

  it('reuses the URL until five minutes before it expires', async () => {
    const { store, bucket, advance } = setup();
    const first = await store.getUrl('c1/a.png');
    advance(HOUR - SIGNED_URL_REFRESH_MARGIN_MS - 1); // 54 min 59.999 s later
    expect(await store.getUrl('c1/a.png')).toBe(first);
    expect(bucket.createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('signs a fresh URL from five minutes before expiry', async () => {
    const { store, bucket, advance } = setup();
    const first = await store.getUrl('c1/a.png');
    advance(HOUR - SIGNED_URL_REFRESH_MARGIN_MS); // exactly 55 min later
    const second = await store.getUrl('c1/a.png');
    expect(second).not.toBe(first);
    expect(bucket.createSignedUrl).toHaveBeenCalledTimes(2);
    // and the new one is cached again
    expect(await store.getUrl('c1/a.png')).toBe(second);
  });

  it('caches each path separately', async () => {
    const { store, bucket } = setup();
    await store.getUrl('c1/a.png');
    await store.getUrl('c1/b.png');
    await store.getUrl('c1/a.png');
    expect(bucket.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failure, and reports a hidden or missing image plainly', async () => {
    const { store, bucket } = setup();
    bucket.createSignedUrl.mockResolvedValueOnce({
      data: null as never,
      error: { statusCode: '400', message: 'Object not found' },
    });
    await expect(store.getUrl('c1/hidden.png')).rejects.toMatchObject({ kind: 'not-found' });
    expect(await store.getUrl('c1/hidden.png')).toContain('c1/hidden.png');
  });

  it('forgets a removed image', async () => {
    const { store, bucket } = setup();
    await store.getUrl('c1/a.png');
    await store.remove('c1/a.png');
    expect(bucket.remove).toHaveBeenCalledWith(['c1/a.png']);
    await store.getUrl('c1/a.png');
    expect(bucket.createSignedUrl).toHaveBeenCalledTimes(2);
  });
});

describe('fake store', () => {
  let fake: ReturnType<typeof createFakeMapImageStore>;
  beforeEach(() => {
    fake = createFakeMapImageStore(() => ({ width: 640, height: 480 }));
  });

  it('keeps uploads in memory with the same contract as the real store', async () => {
    const uploaded = await fake.upload('c1', png());
    expect(uploaded).toEqual({ path: 'c1/fake-1.png', width: 640, height: 480 });
    expect(fake.files.has('c1/fake-1.png')).toBe(true);
    expect(await fake.getUrl(uploaded.path)).toBe('fake://maps/c1/fake-1.png');
    expect(fake.urlCount).toBe(1);
    await fake.remove(uploaded.path);
    await expect(fake.getUrl(uploaded.path)).rejects.toThrow(/No fake map image/);
  });

  it('validates like the real store', async () => {
    await expect(fake.upload('c1', new File([''], 'map.png', { type: 'image/png' }))).rejects.toMatchObject({
      kind: 'validation',
    });
  });
});
