import { describe, expect, it } from 'vitest';
import { clampToImage, containZoom, coverZoom, imageBounds, toImagePoint, toLatLng } from './mapCoordinates';

const size = { width: 4000, height: 3000 };

describe('map coordinates', () => {
  it('maps the four corners', () => {
    expect(toLatLng({ x: 0, y: 0 }, size)).toEqual([3000, 0]); // top-left of the image is north-west
    expect(toLatLng({ x: 4000, y: 0 }, size)).toEqual([3000, 4000]); // top-right
    expect(toLatLng({ x: 0, y: 3000 }, size)).toEqual([0, 0]); // bottom-left
    expect(toLatLng({ x: 4000, y: 3000 }, size)).toEqual([0, 4000]); // bottom-right
  });

  it('maps the centre to the centre', () => {
    expect(toLatLng({ x: 2000, y: 1500 }, size)).toEqual([1500, 2000]);
    expect(toImagePoint([1500, 2000], size)).toEqual({ x: 2000, y: 1500 });
  });

  it('round-trips any point, from either side', () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: 123.5, y: 2876.25 },
      { x: 3999, y: 1 },
      { x: 4000, y: 3000 },
    ]) {
      expect(toImagePoint(toLatLng(point, size), size)).toEqual(point);
    }
    expect(toLatLng(toImagePoint({ lat: 10, lng: 20 }, size), size)).toEqual([10, 20]);
  });

  it('accepts Leaflet LatLng objects as well as pairs', () => {
    expect(toImagePoint({ lat: 3000, lng: 0 }, size)).toEqual({ x: 0, y: 0 });
  });

  it('gives the image bounds as [[south, west], [north, east]]', () => {
    expect(imageBounds(size)).toEqual([
      [0, 0],
      [3000, 4000],
    ]);
  });

  it('keeps a point on the image and rounds it', () => {
    expect(clampToImage({ x: -5, y: 3100.6 }, size)).toEqual({ x: 0, y: 3000 });
    expect(clampToImage({ x: 1234.4, y: 10.5 }, size)).toEqual({ x: 1234, y: 11 });
  });
});

describe('fitting zooms', () => {
  const image = { width: 2000, height: 1500 }; // 4:3

  it('are equal when the box has the image shape', () => {
    expect(coverZoom({ width: 1000, height: 750 }, image)).toBeCloseTo(-1);
    expect(containZoom({ width: 1000, height: 750 }, image)).toBeCloseTo(-1);
  });

  it('cover fills a wide box by width; contain fits it by height', () => {
    const wide = { width: 1600, height: 600 };
    expect(2 ** coverZoom(wide, image) * image.width).toBeCloseTo(1600); // full width, top and bottom cropped
    expect(2 ** containZoom(wide, image) * image.height).toBeCloseTo(600); // whole image, gaps at the sides
    expect(coverZoom(wide, image)).toBeGreaterThan(containZoom(wide, image));
  });

  it('cover fills a tall box by height', () => {
    const tall = { width: 400, height: 900 };
    expect(2 ** coverZoom(tall, image) * image.height).toBeCloseTo(900);
  });
});
