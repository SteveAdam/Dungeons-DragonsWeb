// P0-9: the only place the app reads or writes map images. Everything else talks to a MapImageStore, so the
// images can move to another object store (for example Cloudflare R2) by writing one new implementation.
import type { SupabaseClient } from '@supabase/supabase-js';
import { DataError, toDataError } from '../../data/errors';
import { extensionFor, readImageDimensions, validateMapImageFile, type Dimensions } from './mapImageFiles';

export interface UploadedMapImage extends Dimensions {
  /** Where the image lives: "<campaign id>/<file>". Store this as maps.image_path. */
  path: string;
}

export interface MapImageStore {
  /** Validates, measures and uploads a map image into the campaign's folder. */
  upload(campaignId: string, file: File): Promise<UploadedMapImage>;
  /** A short-lived URL for showing the image. Only works for images the caller may read. */
  getUrl(path: string): Promise<string>;
  /** Deletes an image (DMs only). */
  remove(path: string): Promise<void>;
}

export const MAP_IMAGE_BUCKET = 'maps';
/** Signed URLs last one hour… */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;
/** …and are reused until five minutes before they expire, so a page never shows one that is about to die. */
export const SIGNED_URL_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface SupabaseMapImageStoreOptions {
  /** Current time in ms; swappable for tests. */
  now?: () => number;
  /** New file names; swappable for tests. */
  newId?: () => string;
  /** Image measuring; swappable for tests (jsdom cannot decode images). */
  measure?: (file: File) => Promise<Dimensions>;
}

/** The map image store backed by the private Supabase Storage bucket "maps". */
export function createSupabaseMapImageStore(
  client: Pick<SupabaseClient, 'storage'>,
  {
    now = () => Date.now(),
    newId = () => crypto.randomUUID(),
    measure = file => readImageDimensions(file),
  }: SupabaseMapImageStoreOptions = {},
): MapImageStore {
  const bucket = () => client.storage.from(MAP_IMAGE_BUCKET);
  const urlCache = new Map<string, { url: string; expiresAt: number }>();

  return {
    async upload(campaignId, file) {
      const type = validateMapImageFile(file);
      const { width, height } = await measure(file);
      const path = `${campaignId}/${newId()}.${extensionFor(type)}`;
      const { error } = await bucket().upload(path, file, { contentType: type, cacheControl: '3600', upsert: false });
      if (error) throw toStorageError(error);
      return { path, width, height };
    },

    async getUrl(path) {
      const cached = urlCache.get(path);
      if (cached && now() < cached.expiresAt - SIGNED_URL_REFRESH_MARGIN_MS) return cached.url;

      const requestedAt = now();
      const { data, error } = await bucket().createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) {
        urlCache.delete(path);
        throw error ? toStorageError(error) : new DataError('not-found');
      }
      urlCache.set(path, { url: data.signedUrl, expiresAt: requestedAt + SIGNED_URL_TTL_SECONDS * 1000 });
      return data.signedUrl;
    },

    async remove(path) {
      urlCache.delete(path);
      const { error } = await bucket().remove([path]);
      if (error) throw toStorageError(error);
    },
  };
}

/** Storage errors carry an HTTP status rather than a database code. */
function toStorageError(error: { message?: string; statusCode?: string | number; status?: number }): DataError {
  const status = Number(error.statusCode ?? error.status);
  if (status === 403 || /row-level security|unauthorized/i.test(error.message ?? '')) return new DataError('forbidden');
  if (status === 404 || /not found/i.test(error.message ?? '')) return new DataError('not-found');
  if (status === 413 || /too large|exceeded/i.test(error.message ?? '')) {
    return new DataError('validation', 'That image is too large to upload. Map images can be at most 25 MB.');
  }
  return toDataError(error);
}
