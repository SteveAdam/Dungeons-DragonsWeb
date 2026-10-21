// Checks a map image in the browser before it is uploaded: type, size, dimensions, and whether to offer
// downscaling. Nothing here talks to a server.
import { DataError } from '../../data/errors';

export const MAX_MAP_IMAGE_BYTES = 25 * 1024 * 1024;
/** Images wider than this are slow on phones (NFR-2), so the user is offered a downscale. */
export const MAX_MAP_IMAGE_WIDTH = 4000;

const TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
} as const;
export type MapImageType = keyof typeof TYPES;

const BY_EXTENSION: Record<string, MapImageType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export interface Dimensions {
  width: number;
  height: number;
}

/** The file's image type, from its MIME type or, when the browser gives none, its extension. */
export function mapImageType(file: Pick<File, 'type' | 'name'>): MapImageType | null {
  if (file.type in TYPES) return file.type as MapImageType;
  if (file.type) return null;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[extension] ?? null;
}

export const extensionFor = (type: MapImageType): string => TYPES[type];

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Throws a DataError with a message fit for the user when the file cannot be used as a map. */
export function validateMapImageFile(file: Pick<File, 'type' | 'name' | 'size'>): MapImageType {
  const type = mapImageType(file);
  if (!type) {
    throw new DataError('validation', 'That file is not a map image. Use a PNG, JPG, WebP or SVG file.');
  }
  if (file.size === 0) {
    throw new DataError('validation', 'That file is empty. Choose the map image again.');
  }
  if (file.size > MAX_MAP_IMAGE_BYTES) {
    throw new DataError(
      'validation',
      `That image is ${formatMegabytes(file.size)}. Map images can be at most 25 MB: export it smaller or as a JPG or WebP.`,
    );
  }
  return type;
}

/** Reads width and height from an SVG's attributes, falling back to its viewBox. */
export function svgDimensions(svgText: string): Dimensions | null {
  const tag = /<svg\b[^>]*>/i.exec(svgText)?.[0];
  if (!tag) return null;
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag)?.[1];
  const number = (value: string | undefined) => {
    const n = value && /^\s*[\d.]+\s*(px)?\s*$/.test(value) ? parseFloat(value) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const width = number(attr('width'));
  const height = number(attr('height'));
  if (width && height) return { width: Math.round(width), height: Math.round(height) };

  const box = attr('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (box && box.length === 4 && box[2] > 0 && box[3] > 0) {
    return { width: Math.round(box[2]), height: Math.round(box[3]) };
  }
  return null;
}

/** Loads a raster image in the browser and returns its natural size. */
async function loadRasterDimensions(file: Blob): Promise<Dimensions> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The image's size in pixels. `loadRaster` is swappable for tests (jsdom cannot decode images). */
export async function readImageDimensions(
  file: File,
  loadRaster: (file: Blob) => Promise<Dimensions> = loadRasterDimensions,
): Promise<Dimensions> {
  const type = mapImageType(file);
  let size: Dimensions | null;
  try {
    size = type === 'image/svg+xml' ? svgDimensions(await file.text()) : await loadRaster(file);
  } catch {
    size = null;
  }
  if (!size || size.width <= 0 || size.height <= 0) {
    throw new DataError(
      'validation',
      type === 'image/svg+xml'
        ? 'We could not read that SVG’s size. Give its <svg> element a width and height, or a viewBox.'
        : 'We could not read that image. It may be damaged; try exporting it again.',
    );
  }
  return size;
}

export interface DownscaleOffer {
  from: Dimensions;
  to: Dimensions;
  /** What to tell the user before they choose. */
  message: string;
}

/**
 * Whether to offer downscaling, and to what size. Only raster images wider than 4000 px qualify: an SVG
 * is drawn at any size, so shrinking it would gain nothing.
 */
export function downscaleOffer(type: MapImageType, size: Dimensions): DownscaleOffer | null {
  if (type === 'image/svg+xml' || size.width <= MAX_MAP_IMAGE_WIDTH) return null;
  const to = {
    width: MAX_MAP_IMAGE_WIDTH,
    height: Math.max(1, Math.round((size.height * MAX_MAP_IMAGE_WIDTH) / size.width)),
  };
  return {
    from: size,
    to,
    message:
      `This map is ${size.width} × ${size.height} px. Maps wider than ${MAX_MAP_IMAGE_WIDTH} px load slowly on phones. ` +
      `Shrink it to ${to.width} × ${to.height} px before uploading, or keep the full size?`,
  };
}

/** Redraws a raster image at a smaller size, keeping its type (browser only: uses a canvas). */
export async function downscaleImage(file: File, to: Dimensions): Promise<File> {
  const type = mapImageType(file);
  if (!type || type === 'image/svg+xml') return file;
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = to.width;
    canvas.height = to.height;
    const context = canvas.getContext('2d');
    if (!context) throw new DataError('unknown');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, to.width, to.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.92));
    if (!blob) throw new DataError('unknown');
    return new File([blob], file.name, { type });
  } finally {
    bitmap.close();
  }
}
