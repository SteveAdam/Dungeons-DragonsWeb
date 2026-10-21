import { describe, expect, it } from 'vitest';
import {
  downscaleOffer,
  MAX_MAP_IMAGE_BYTES,
  mapImageType,
  readImageDimensions,
  svgDimensions,
  validateMapImageFile,
} from './mapImageFiles';

/** A file-like value of a given size without allocating the bytes. */
const fileLike = (name: string, type: string, size: number) => ({ name, type, size });

describe('validateMapImageFile', () => {
  it.each([
    ['map.png', 'image/png'],
    ['map.jpg', 'image/jpeg'],
    ['map.webp', 'image/webp'],
    ['map.svg', 'image/svg+xml'],
  ])('accepts %s', (name, type) => {
    expect(validateMapImageFile(fileLike(name, type, 1024))).toBe(type);
  });

  it('falls back to the extension when the browser gives no type', () => {
    expect(validateMapImageFile(fileLike('Sword Coast.JPEG', '', 1024))).toBe('image/jpeg');
    expect(mapImageType({ name: 'notes.txt', type: '' })).toBeNull();
  });

  it.each([
    ['map.gif', 'image/gif'],
    ['map.pdf', 'application/pdf'],
    ['map.png', 'text/plain'], // the type wins over a misleading extension
  ])('refuses %s (%s) with a friendly message', (name, type) => {
    expect(() => validateMapImageFile(fileLike(name, type, 1024))).toThrowError(
      'That file is not a map image. Use a PNG, JPG, WebP or SVG file.',
    );
  });

  it('accepts exactly 25 MB and refuses one byte more, saying how big it is', () => {
    expect(validateMapImageFile(fileLike('big.png', 'image/png', MAX_MAP_IMAGE_BYTES))).toBe('image/png');
    expect(() => validateMapImageFile(fileLike('big.png', 'image/png', MAX_MAP_IMAGE_BYTES + 1))).toThrowError(
      /That image is 25\.0 MB\. Map images can be at most 25 MB/,
    );
  });

  it('refuses an empty file', () => {
    expect(() => validateMapImageFile(fileLike('map.png', 'image/png', 0))).toThrowError(/empty/);
  });

  it('throws a validation DataError, so screens show the message as is', () => {
    try {
      validateMapImageFile(fileLike('map.gif', 'image/gif', 1));
    } catch (e) {
      expect(e).toMatchObject({ name: 'DataError', kind: 'validation' });
    }
    expect.assertions(1);
  });
});

describe('dimensions', () => {
  it('reads an SVG from width and height, or from its viewBox', () => {
    expect(svgDimensions('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800px">')).toEqual({
      width: 1200,
      height: 800,
    });
    expect(svgDimensions('<?xml version="1.0"?><svg viewBox="0 0 5000 2500.4">')).toEqual({
      width: 5000,
      height: 2500,
    });
    expect(svgDimensions('<svg width="100%" height="100%" viewBox="0,0,640,480">')).toEqual({
      width: 640,
      height: 480,
    });
    expect(svgDimensions('<svg width="100%">')).toBeNull();
    expect(svgDimensions('not an svg')).toBeNull();
  });

  it('measures SVG text and raster files', async () => {
    const svg = new File(['<svg width="300" height="200"></svg>'], 'map.svg', { type: 'image/svg+xml' });
    expect(await readImageDimensions(svg)).toEqual({ width: 300, height: 200 });
    const png = new File(['x'], 'map.png', { type: 'image/png' });
    expect(await readImageDimensions(png, async () => ({ width: 6000, height: 3000 }))).toEqual({
      width: 6000,
      height: 3000,
    });
  });

  it('explains an unreadable image', async () => {
    const png = new File(['x'], 'map.png', { type: 'image/png' });
    await expect(
      readImageDimensions(png, async () => {
        throw new Error('decode failed');
      }),
    ).rejects.toThrowError(/could not read that image/);
    const svg = new File(['<svg></svg>'], 'map.svg', { type: 'image/svg+xml' });
    await expect(readImageDimensions(svg)).rejects.toThrowError(/width and height, or a viewBox/);
  });
});

describe('downscaleOffer', () => {
  it('offers nothing up to 4000 px wide', () => {
    expect(downscaleOffer('image/png', { width: 4000, height: 9000 })).toBeNull();
  });

  it('offers 4000 px wide, keeping the shape, and says so in plain words', () => {
    const offer = downscaleOffer('image/jpeg', { width: 8000, height: 6001 });
    expect(offer).toMatchObject({ from: { width: 8000, height: 6001 }, to: { width: 4000, height: 3001 } });
    expect(offer?.message).toBe(
      'This map is 8000 × 6001 px. Maps wider than 4000 px load slowly on phones. ' +
        'Shrink it to 4000 × 3001 px before uploading, or keep the full size?',
    );
  });

  it('never offers to shrink an SVG, which is drawn at any size', () => {
    expect(downscaleOffer('image/svg+xml', { width: 9000, height: 9000 })).toBeNull();
  });

  it('keeps a very thin image at least 1 px tall', () => {
    expect(downscaleOffer('image/webp', { width: 100000, height: 10 })?.to).toEqual({ width: 4000, height: 1 });
  });
});
