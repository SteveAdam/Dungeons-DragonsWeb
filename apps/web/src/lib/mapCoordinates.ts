// The one place that converts between how pins are stored and how Leaflet draws them.
//
// Stored:  image pixels, x from the left edge, y from the TOP edge (like any image editor).
// Leaflet: CRS.Simple, where one unit is one image pixel at zoom 0 and latitude grows UPWARD.
// So lat = height - y and lng = x. The image covers [[0, 0], [height, width]].

export interface ImageSize {
  width: number;
  height: number;
}

export interface ImagePoint {
  x: number;
  y: number;
}

/** [lat, lng], the order Leaflet uses. */
export type LatLngPair = [number, number];

export function toLatLng(point: ImagePoint, size: ImageSize): LatLngPair {
  return [size.height - point.y, point.x];
}

export function toImagePoint(latLng: LatLngPair | { lat: number; lng: number }, size: ImageSize): ImagePoint {
  const [lat, lng] = Array.isArray(latLng) ? latLng : [latLng.lat, latLng.lng];
  return { x: lng, y: size.height - lat };
}

/** The image's corners in Leaflet coordinates: [[south, west], [north, east]]. */
export function imageBounds(size: ImageSize): [LatLngPair, LatLngPair] {
  return [
    [0, 0],
    [size.height, size.width],
  ];
}

/** Keeps a point on the image (a click just outside the edge lands on the edge), rounded to whole pixels. */
export function clampToImage(point: ImagePoint, size: ImageSize): ImagePoint {
  return {
    x: Math.round(Math.min(Math.max(point.x, 0), size.width)),
    y: Math.round(Math.min(Math.max(point.y, 0), size.height)),
  };
}

/**
 * Leaflet zoom levels for showing an image in a box. In CRS.Simple zoom 0 draws one image pixel per screen
 * pixel, and each zoom step doubles that, so the zoom for a scale s is log2(s).
 *   cover:   the image fills the box completely (the overflow is cropped and can be panned to)
 *   contain: the whole image fits inside the box (gaps where the shapes differ)
 * They are equal when the box has the image's shape.
 */
export function coverZoom(box: ImageSize, image: ImageSize): number {
  return Math.log2(Math.max(box.width / image.width, box.height / image.height));
}

export function containZoom(box: ImageSize, image: ImageSize): number {
  return Math.log2(Math.min(box.width / image.width, box.height / image.height));
}
