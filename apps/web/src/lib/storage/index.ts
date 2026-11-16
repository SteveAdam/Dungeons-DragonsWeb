// The app's map image store. Import mapImageStore from here; never call supabase.storage directly
// (ESLint enforces it outside src/lib/storage).
import { supabase } from '../supabase';
import { createSupabaseHandoutImageStore, type HandoutImageStore } from './handoutImages';
import { createSupabaseMapImageStore, type MapImageStore } from './mapImages';

export const mapImageStore: MapImageStore = createSupabaseMapImageStore(supabase);
/** P4-4: handout images, in their own private bucket. */
export const handoutImageStore: HandoutImageStore = createSupabaseHandoutImageStore(supabase);

export type { MapImageStore, UploadedMapImage } from './mapImages';
export type { HandoutImageStore } from './handoutImages';
export { MAX_HANDOUT_IMAGE_BYTES, validateHandoutImageFile } from './handoutImages';
export {
  downscaleImage,
  downscaleOffer,
  MAX_MAP_IMAGE_BYTES,
  MAX_MAP_IMAGE_WIDTH,
  readImageDimensions,
  validateMapImageFile,
  type DownscaleOffer,
} from './mapImageFiles';
