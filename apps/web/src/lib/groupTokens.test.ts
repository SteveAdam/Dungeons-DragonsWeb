import { describe, expect, it } from 'vitest';
import {
  GROUP_COLORS,
  healthWord,
  locationText,
  nextGroup,
  nudgePoint,
  regionAt,
  safeGroupColor,
  tokenPoint,
  tokenStep,
} from './groupTokens';

const size = { width: 1000, height: 500 };
const wood = { id: 'wood', cx: 300, cy: 200, radius: 100 };
const clearing = { id: 'clearing', cx: 320, cy: 210, radius: 30 };
const town = { id: 'town', cx: 800, cy: 400, radius: 50 };

describe('regionAt', () => {
  it('finds the region a spot is in, or none', () => {
    expect(regionAt({ x: 800, y: 400 }, [wood, town])?.id).toBe('town');
    expect(regionAt({ x: 600, y: 100 }, [wood, town])).toBeNull();
  });

  it('takes the innermost region where two overlap, whatever their order', () => {
    expect(regionAt({ x: 320, y: 210 }, [wood, clearing])?.id).toBe('clearing');
    expect(regionAt({ x: 320, y: 210 }, [clearing, wood])?.id).toBe('clearing');
    expect(regionAt({ x: 250, y: 200 }, [wood, clearing])?.id).toBe('wood');
  });

  it('counts the edge as inside', () => {
    expect(regionAt({ x: 400, y: 200 }, [wood])?.id).toBe('wood');
    expect(regionAt({ x: 401, y: 200 }, [wood])).toBeNull();
  });
});

describe('nudgePoint', () => {
  it('moves a fiftieth of the short side per arrow key', () => {
    expect(tokenStep(size)).toBe(10);
    expect(nudgePoint({ x: 100, y: 100 }, 'ArrowRight', size)).toEqual({ x: 110, y: 100 });
    expect(nudgePoint({ x: 100, y: 100 }, 'ArrowLeft', size)).toEqual({ x: 90, y: 100 });
    expect(nudgePoint({ x: 100, y: 100 }, 'ArrowUp', size)).toEqual({ x: 100, y: 90 });
    expect(nudgePoint({ x: 100, y: 100 }, 'ArrowDown', size)).toEqual({ x: 100, y: 110 });
  });

  it('takes five steps with shift', () => {
    expect(nudgePoint({ x: 100, y: 100 }, 'ArrowRight', size, true)).toEqual({ x: 150, y: 100 });
  });

  it('stops at the edges of the map', () => {
    expect(nudgePoint({ x: 3, y: 498 }, 'ArrowLeft', size)).toEqual({ x: 0, y: 498 });
    expect(nudgePoint({ x: 3, y: 498 }, 'ArrowDown', size)).toEqual({ x: 3, y: 500 });
    expect(nudgePoint({ x: 998, y: 0 }, 'ArrowRight', size)).toEqual({ x: 1000, y: 0 });
  });

  it('leaves any other key alone', () => {
    expect(nudgePoint({ x: 1, y: 1 }, 'Enter', size)).toBeNull();
    expect(nudgePoint({ x: 1, y: 1 }, 'a', size)).toBeNull();
  });

  it('never moves less than a pixel on a tiny map', () => {
    expect(tokenStep({ width: 20, height: 20 })).toBe(1);
  });
});

describe('tokenPoint', () => {
  it('uses the saved spot', () => {
    expect(tokenPoint({ x: 12, y: 34, regionId: 'wood' }, [wood], size, 0)).toEqual({ x: 12, y: 34 });
  });

  it('falls back to the middle of its region, then of the map', () => {
    expect(tokenPoint({ x: null, y: null, regionId: 'wood' }, [wood], size, 0)).toEqual({ x: 300, y: 200 });
    expect(tokenPoint({ x: null, y: null, regionId: null }, [wood], size, 0)).toEqual({ x: 500, y: 250 });
    expect(tokenPoint({ x: null, y: null, regionId: 'gone' }, [wood], size, 0)).toEqual({ x: 500, y: 250 });
  });

  it('spreads tokens with no spot of their own so they do not hide one another', () => {
    expect(tokenPoint({ x: null, y: null, regionId: null }, [], size, 0).x).toBe(500);
    expect(tokenPoint({ x: null, y: null, regionId: null }, [], size, 1).x).toBe(520);
    expect(tokenPoint({ x: null, y: null, regionId: null }, [], size, 2).x).toBe(540);
  });
});

describe('new groups', () => {
  it('names the next group and takes the next colour', () => {
    expect(nextGroup([])).toEqual({ name: 'Group 1', color: GROUP_COLORS[0] });
    expect(nextGroup([{ name: 'Group 1' }])).toEqual({ name: 'Group 2', color: GROUP_COLORS[1] });
  });

  it('skips a name already taken', () => {
    expect(nextGroup([{ name: 'Vanguard' }, { name: 'Group 2' }]).name).toBe('Group 3');
  });

  it('comes back to the first colour after the last', () => {
    const many = Array.from({ length: GROUP_COLORS.length }, (_, i) => ({ name: `G${i}` }));
    expect(nextGroup(many).color).toBe(GROUP_COLORS[0]);
  });

  it('only lets a real hex colour into the map marker', () => {
    expect(safeGroupColor('#3D6A5D')).toBe('#3D6A5D');
    expect(safeGroupColor('red;background:url(x)')).toBe(GROUP_COLORS[0]);
  });
});

describe('health and place wording', () => {
  it('names a hit point state in a word as well as a colour', () => {
    expect(healthWord(50, 50)).toEqual({ word: 'Healthy', tone: 'high' });
    expect(healthWord(25, 50)).toEqual({ word: 'Wounded', tone: 'mid' });
    expect(healthWord(12, 50)).toEqual({ word: 'Badly wounded', tone: 'low' });
    expect(healthWord(0, 50)).toEqual({ word: 'Down', tone: 'low' });
  });

  it('says where a group is, as far as the viewer may read it', () => {
    expect(locationText({ mapId: null, mapName: null, regionName: null })).toBe('Not on any map');
    expect(locationText({ mapId: 'm', mapName: 'Vault', regionName: null })).toBe('Vault');
    expect(locationText({ mapId: 'm', mapName: 'Vault', regionName: 'Gates' })).toBe('Vault · Gates');
    expect(locationText({ mapId: 'm', mapName: null, regionName: null })).toBe('A map you cannot read');
  });
});
