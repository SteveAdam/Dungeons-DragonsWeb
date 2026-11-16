// P4-4: the only place the app reads or writes handout images (the private bucket "handouts"). Everything else talks to
// a HandoutImageStore, the same way map images go through MapImageStore. The bucket itself also refuses anything but
// PNG, JPG and WebP of at most 10 MB (migration 0030), so these checks are for friendly messages, not for safety.
import type { SupabaseClient } from '@supabase/supabase-js';
import { DataError, toDataError } from '../../data/errors';

export const HANDOUT_IMAGE_BUCKET = 'handouts';
export const MAX_HANDOUT_IMAGE_BYTES = 10 * 1024 * 1024;
/** Signed URLs last one hour and are reused until five minutes before they expire. */
export const HANDOUT_URL_TTL_SECONDS = 60 * 60;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;
export type HandoutImageType = keyof typeof TYPES;
const BY_EXTENSION: Record<string, HandoutImageType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** The file's image type, from its MIME type or, when the browser gives none, its extension. */
export function handoutImageType(file: Pick<File, 'type' | 'name'>): HandoutImageType | null {
  if (file.type in TYPES) return file.type as HandoutImageType;
  if (file.type) return null;
  return BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

/** Throws a DataError with a message fit for the user when the file cannot be a handout image. */
export function validateHandoutImageFile(file: Pick<File, 'type' | 'name' | 'size'>): HandoutImageType {
  const type = handoutImageType(file);
  if (!type) throw new DataError('validation', 'Handout images can be PNG, JPG or WebP files.');
  if (file.size === 0) throw new DataError('validation', 'That file is empty. Choose the image again.');
  if (file.size > MAX_HANDOUT_IMAGE_BYTES) {
    throw new DataError(
      'validation',
      `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Handout images can be at most 10 MB.`,
    );
  }
  return type;
}

export interface HandoutImageStore {
  /** Validates and uploads an image into the campaign's folder; returns its path ("<campaign id>/<file>"). */
  upload(campaignId: string, file: File): Promise<string>;
  /** A short-lived URL for showing the image. Only works for a DM, or a player the handout was shown to. */
  getUrl(path: string): Promise<string>;
  /** Deletes an image (DMs only). */
  remove(path: string): Promise<void>;
}

export interface SupabaseHandoutImageStoreOptions {
  now?: () => number;
  newId?: () => string;
}

export function createSupabaseHandoutImageStore(
  client: Pick<SupabaseClient, 'storage'>,
  { now = () => Date.now(), newId = () => crypto.randomUUID() }: SupabaseHandoutImageStoreOptions = {},
): HandoutImageStore {
  const bucket = () => client.storage.from(HANDOUT_IMAGE_BUCKET);
  const urlCache = new Map<string, { url: string; expiresAt: number }>();

  return {
    async upload(campaignId, file) {
      const type = validateHandoutImageFile(file);
      const path = `${campaignId}/${newId()}.${TYPES[type]}`;
      const { error } = await bucket().upload(path, file, { contentType: type, cacheControl: '3600', upsert: false });
      if (error) throw toStorageError(error);
      return path;
    },

    async getUrl(path) {
      const cached = urlCache.get(path);
      if (cached && now() < cached.expiresAt - REFRESH_MARGIN_MS) return cached.url;
      const requestedAt = now();
      const { data, error } = await bucket().createSignedUrl(path, HANDOUT_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) {
        urlCache.delete(path);
        throw error ? toStorageError(error) : new DataError('not-found');
      }
      urlCache.set(path, { url: data.signedUrl, expiresAt: requestedAt + HANDOUT_URL_TTL_SECONDS * 1000 });
      return data.signedUrl;
    },

    async remove(path) {
      urlCache.delete(path);
      const { error } = await bucket().remove([path]);
      if (error) throw toStorageError(error);
    },
  };
}

function toStorageError(error: { message?: string; statusCode?: string | number; status?: number }): DataError {
  const status = Number(error.statusCode ?? error.status);
  if (status === 403 || /row-level security|unauthorized/i.test(error.message ?? '')) return new DataError('forbidden');
  if (status === 404 || /not found/i.test(error.message ?? '')) return new DataError('not-found');
  if (status === 413 || /too large|exceeded/i.test(error.message ?? '')) {
    return new DataError('validation', 'That image is too large. Handout images can be at most 10 MB.');
  }
  if (status === 415 || /mime type/i.test(error.message ?? '')) {
    return new DataError('validation', 'Handout images can be PNG, JPG or WebP files.');
  }
  return toDataError(error);
}

/** An in-memory store for tests: validates like the real one. */
export function createFakeHandoutImageStore(): HandoutImageStore & { readonly files: ReadonlyMap<string, File> } {
  const files = new Map<string, File>();
  let next = 0;
  return {
    files,
    async upload(campaignId, file) {
      const type = validateHandoutImageFile(file);
      next += 1;
      const path = `${campaignId}/fake-${next}.${TYPES[type]}`;
      files.set(path, file);
      return path;
    },
    async getUrl(path) {
      if (!files.has(path)) throw new DataError('not-found');
      return `fake://handouts/${path}`;
    },
    async remove(path) {
      files.delete(path);
    },
  };
}
