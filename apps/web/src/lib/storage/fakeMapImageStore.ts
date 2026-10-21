import { extensionFor, validateMapImageFile, type Dimensions } from './mapImageFiles';
import type { MapImageStore, UploadedMapImage } from './mapImages';

export interface FakeMapImageStore extends MapImageStore {
  /** What is "in the bucket" right now, by path. */
  readonly files: ReadonlyMap<string, File>;
  /** How many URLs were handed out (a real store would have signed this many). */
  readonly urlCount: number;
}

/**
 * An in-memory MapImageStore for tests and stories. It validates files like the real one, but takes the
 * dimensions from `sizeOf` because jsdom cannot decode images.
 */
export function createFakeMapImageStore(
  sizeOf: (file: File) => Dimensions = () => ({ width: 1000, height: 750 }),
): FakeMapImageStore {
  const files = new Map<string, File>();
  let next = 0;
  let urlCount = 0;

  return {
    files,
    get urlCount() {
      return urlCount;
    },
    async upload(campaignId, file): Promise<UploadedMapImage> {
      const type = validateMapImageFile(file);
      next += 1;
      const path = `${campaignId}/fake-${next}.${extensionFor(type)}`;
      files.set(path, file);
      return { path, ...sizeOf(file) };
    },
    async getUrl(path) {
      if (!files.has(path)) throw new Error(`No fake map image at ${path}`);
      urlCount += 1;
      return `fake://maps/${path}`;
    },
    async remove(path) {
      files.delete(path);
    },
  };
}
