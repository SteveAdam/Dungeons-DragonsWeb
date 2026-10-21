// The app's map image store. Import mapImageStore from here; never call supabase.storage directly
// (ESLint enforces it outside src/lib/storage).
import { supabase } from '../supabase';
import { createSupabaseMapImageStore, type MapImageStore } from './mapImages';

export const mapImageStore: MapImageStore = createSupabaseMapImageStore(supabase);

export type { MapImageStore, UploadedMapImage } from './mapImages';
export {
  downscaleImage,
  downscaleOffer,
  MAX_MAP_IMAGE_BYTES,
  MAX_MAP_IMAGE_WIDTH,
  readImageDimensions,
  validateMapImageFile,
  type DownscaleOffer,
} from './mapImageFiles';
