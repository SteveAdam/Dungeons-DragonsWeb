// Terrain, travel and weather for map regions (EXL-1, EXL-3), from the SRD 5.2.1: "Travel Pace" (Playing the
// Game), and "Travel Pace", "Travel Terrain" and "Environmental Effects" (Gameplay Toolbox). Rule text is
// paraphrased; numbers are the SRD's. The keys match the check constraints on public.regions (0003_regions.sql).
//
// 2024 rules note: terrain does not halve overland travel. Each kind of terrain sets the MAXIMUM pace a group
// can travel at; a good road raises that maximum by one step.

export const TERRAINS = [
  'arctic',
  'tundra',
  'boreal_forest',
  'temperate_forest',
  'jungle',
  'grassland',
  'farmland',
  'hills',
  'mountains',
  'desert',
  'badlands',
  'swamp',
  'coast',
  'sea',
  'volcanic',
  'underdark',
  'urban',
] as const;
export type Terrain = (typeof TERRAINS)[number];

export const WEATHERS = [
  'clear',
  'overcast',
  'fog',
  'rain',
  'heavy_rain',
  'thunderstorm',
  'snow',
  'blizzard',
  'hail',
  'sandstorm',
  'strong_wind',
  'extreme_heat',
  'extreme_cold',
] as const;
export type Weather = (typeof WEATHERS)[number];

// TRAVEL PACE (SRD "Travel Pace" table) -------------------------------------------------------------------

export type Pace = 'slow' | 'normal' | 'fast';
const PACE_ORDER: readonly Pace[] = ['slow', 'normal', 'fast'];

export const TRAVEL_PACE: Record<
  Pace,
  { label: string; feetPerMinute: number; milesPerHour: number; milesPerDay: number; effect: string }
> = {
  fast: {
    label: 'Fast',
    feetPerMinute: 400,
    milesPerHour: 4,
    milesPerDay: 30,
    effect: 'Disadvantage on Wisdom (Perception or Survival) and Dexterity (Stealth) checks.',
  },
  normal: {
    label: 'Normal',
    feetPerMinute: 300,
    milesPerHour: 3,
    milesPerDay: 24,
    effect: 'Disadvantage on Dexterity (Stealth) checks.',
  },
  slow: {
    label: 'Slow',
    feetPerMinute: 200,
    milesPerHour: 2,
    milesPerDay: 18,
    effect: 'Advantage on Wisdom (Perception or Survival) checks.',
  },
};

/** Miles per day at each pace, kept for older callers. */
export const MILES_PER_DAY = { slow: 18, normal: 24, fast: 30 } as const;

// TRAVEL TERRAIN (SRD "Travel Terrain" table) -------------------------------------------------------------

export type SrdTerrain =
  | 'arctic'
  | 'coastal'
  | 'desert'
  | 'forest'
  | 'grassland'
  | 'hill'
  | 'mountain'
  | 'swamp'
  | 'underdark'
  | 'urban'
  | 'waterborne';

export interface SrdTerrainInfo {
  label: string;
  /** The fastest pace allowed; 'special' for waterborne travel, which uses the vessel's speed. */
  maxPace: Pace | 'special';
  maxPaceNote?: string;
  /** How far away encounters start, as dice times 10 feet. */
  encounterDistance: string;
  foragingDc: number;
  navigationDc: number;
  searchDc: number;
}

export const SRD_TERRAIN: Record<SrdTerrain, SrdTerrainInfo> = {
  arctic: {
    label: 'Arctic',
    maxPace: 'fast',
    maxPaceNote: 'Needs suitable equipment (such as skis) to keep up a Fast pace.',
    encounterDistance: '6d6 × 10 feet',
    foragingDc: 20,
    navigationDc: 10,
    searchDc: 10,
  },
  coastal: {
    label: 'Coastal',
    maxPace: 'normal',
    encounterDistance: '2d10 × 10 feet',
    foragingDc: 10,
    navigationDc: 5,
    searchDc: 15,
  },
  desert: {
    label: 'Desert',
    maxPace: 'normal',
    encounterDistance: '6d6 × 10 feet',
    foragingDc: 20,
    navigationDc: 10,
    searchDc: 10,
  },
  forest: {
    label: 'Forest',
    maxPace: 'normal',
    encounterDistance: '2d8 × 10 feet',
    foragingDc: 10,
    navigationDc: 15,
    searchDc: 15,
  },
  grassland: {
    label: 'Grassland',
    maxPace: 'fast',
    encounterDistance: '6d6 × 10 feet',
    foragingDc: 15,
    navigationDc: 5,
    searchDc: 15,
  },
  hill: {
    label: 'Hill',
    maxPace: 'normal',
    encounterDistance: '2d10 × 10 feet',
    foragingDc: 15,
    navigationDc: 10,
    searchDc: 15,
  },
  mountain: {
    label: 'Mountain',
    maxPace: 'slow',
    encounterDistance: '4d10 × 10 feet',
    foragingDc: 20,
    navigationDc: 15,
    searchDc: 20,
  },
  swamp: {
    label: 'Swamp',
    maxPace: 'slow',
    encounterDistance: '2d8 × 10 feet',
    foragingDc: 10,
    navigationDc: 15,
    searchDc: 20,
  },
  underdark: {
    label: 'Underdark',
    maxPace: 'normal',
    encounterDistance: '2d6 × 10 feet',
    foragingDc: 20,
    navigationDc: 10,
    searchDc: 20,
  },
  urban: {
    label: 'Urban',
    maxPace: 'normal',
    encounterDistance: '2d6 × 10 feet',
    foragingDc: 20,
    navigationDc: 15,
    searchDc: 15,
  },
  waterborne: {
    label: 'Waterborne',
    maxPace: 'special',
    maxPaceNote: 'Travel at the speed of the vessel; no travel pace is chosen.',
    encounterDistance: '6d6 × 10 feet',
    foragingDc: 15,
    navigationDc: 10,
    searchDc: 15,
  },
};

// OUR TERRAINS -------------------------------------------------------------------------------------------

export interface TerrainInfo {
  label: string;
  /** The SRD terrain whose travel rules apply (our list is finer than the SRD's). */
  srdTerrain: SrdTerrain;
  /** What the land is like, for the DM to read out or build on. */
  note: string;
  /** The weather this land usually sees, most common first. "Roll weather" picks from these. */
  typicalWeather: readonly Weather[];
}

export const TERRAIN_INFO: Record<Terrain, TerrainInfo> = {
  arctic: {
    label: 'Arctic',
    srdTerrain: 'arctic',
    note: 'Ice sheets and deep snow. Slippery ice and thin ice are common hazards.',
    typicalWeather: ['extreme_cold', 'snow', 'blizzard', 'strong_wind', 'clear'],
  },
  tundra: {
    label: 'Tundra',
    srdTerrain: 'arctic',
    note: 'Treeless, frozen plains with little shelter from the wind.',
    typicalWeather: ['extreme_cold', 'strong_wind', 'snow', 'overcast', 'clear'],
  },
  boreal_forest: {
    label: 'Boreal forest',
    srdTerrain: 'forest',
    note: 'Dense pine and spruce under long winters; snow lies deep between the trees.',
    typicalWeather: ['snow', 'overcast', 'extreme_cold', 'fog', 'clear'],
  },
  temperate_forest: {
    label: 'Temperate forest',
    srdTerrain: 'forest',
    note: 'Oak and beech woods with paths and clearings; thick undergrowth off the trails.',
    typicalWeather: ['clear', 'overcast', 'rain', 'fog', 'thunderstorm'],
  },
  jungle: {
    label: 'Jungle',
    srdTerrain: 'forest',
    note: 'Steaming, tangled growth. Visibility rarely goes beyond a few dozen feet.',
    typicalWeather: ['heavy_rain', 'thunderstorm', 'rain', 'extreme_heat', 'fog'],
  },
  grassland: {
    label: 'Grassland',
    srdTerrain: 'grassland',
    note: 'Open plains; you see trouble coming from far off, and it sees you.',
    typicalWeather: ['clear', 'strong_wind', 'overcast', 'thunderstorm', 'hail'],
  },
  farmland: {
    label: 'Farmland',
    srdTerrain: 'grassland',
    note: 'Fields, hedgerows and villages linked by cart roads.',
    typicalWeather: ['clear', 'overcast', 'rain', 'fog'],
  },
  hills: {
    label: 'Hills',
    srdTerrain: 'hill',
    note: 'Rolling high ground, good for watchtowers and ambushes.',
    typicalWeather: ['clear', 'overcast', 'strong_wind', 'rain', 'fog'],
  },
  mountains: {
    label: 'Mountains',
    srdTerrain: 'mountain',
    note: 'Steep climbs. Above 10,000 feet each hour of travel counts as 2 hours of travel.',
    typicalWeather: ['strong_wind', 'snow', 'extreme_cold', 'clear', 'blizzard'],
  },
  desert: {
    label: 'Desert',
    srdTerrain: 'desert',
    note: 'Dunes and salt flats; water is the first thing to run out.',
    typicalWeather: ['extreme_heat', 'clear', 'sandstorm', 'strong_wind'],
  },
  badlands: {
    label: 'Badlands',
    srdTerrain: 'hill',
    note: 'Eroded canyons and mesas; easy to get lost, easy to get trapped.',
    typicalWeather: ['clear', 'extreme_heat', 'strong_wind', 'thunderstorm'],
  },
  swamp: {
    label: 'Swamp',
    srdTerrain: 'swamp',
    note: 'Mud, reeds and stagnant water; insects and worse.',
    typicalWeather: ['fog', 'rain', 'overcast', 'extreme_heat', 'heavy_rain'],
  },
  coast: {
    label: 'Coast',
    srdTerrain: 'coastal',
    note: 'Cliffs, coves and beaches. Tides can cut off a path within the hour.',
    typicalWeather: ['strong_wind', 'fog', 'clear', 'rain', 'thunderstorm'],
  },
  sea: {
    label: 'Open sea',
    srdTerrain: 'waterborne',
    note: 'Travel by ship. Frigid water saps a swimmer within minutes.',
    typicalWeather: ['clear', 'strong_wind', 'thunderstorm', 'fog', 'heavy_rain'],
  },
  volcanic: {
    label: 'Volcanic',
    srdTerrain: 'mountain',
    note: 'Ash fields, lava tubes and vents of poisonous gas.',
    typicalWeather: ['extreme_heat', 'overcast', 'strong_wind', 'clear'],
  },
  underdark: {
    label: 'Underdark',
    srdTerrain: 'underdark',
    note: 'Endless caverns without daylight; darkness is the norm, not the weather.',
    typicalWeather: ['clear', 'fog'],
  },
  urban: {
    label: 'City',
    srdTerrain: 'urban',
    note: 'Streets, markets and alleys; shelter is never far away.',
    typicalWeather: ['clear', 'overcast', 'rain', 'fog'],
  },
};

/** The SRD travel rules for one of our terrains. */
export const travelTerrain = (terrain: Terrain): SrdTerrainInfo => SRD_TERRAIN[TERRAIN_INFO[terrain].srdTerrain];

/**
 * The pace a group actually travels at: the pace it wants, but no faster than the terrain allows. A good road
 * raises the terrain's maximum by one step. null for waterborne travel (the vessel's speed decides).
 */
export function effectivePace(terrain: Terrain | null, wanted: Pace, goodRoad = false): Pace | null {
  if (!terrain) return wanted;
  const max = travelTerrain(terrain).maxPace;
  if (max === 'special') return null;
  const maxIndex = Math.min(PACE_ORDER.indexOf(max) + (goodRoad ? 1 : 0), PACE_ORDER.length - 1);
  return PACE_ORDER[Math.min(PACE_ORDER.indexOf(wanted), maxIndex)];
}

/** Miles a day's travel covers in this terrain at the wanted pace (limited by the terrain); null at sea. */
export function milesPerDay(terrain: Terrain, pace: Pace = 'normal', goodRoad = false): number | null {
  const actual = effectivePace(terrain, pace, goodRoad);
  return actual ? TRAVEL_PACE[actual].milesPerDay : null;
}

export interface JourneyLeg {
  miles: number;
  /** The terrain of the region this leg runs through, or null outside every region. */
  terrain: Terrain | null;
}

export interface Journey {
  miles: number;
  /** Hours on the move, at the per-hour rates. */
  hours: number;
  /** Travel days, at the per-day rates (a travel day is about 8 hours). */
  days: number;
  /** Terrains that forced a slower pace than the one wanted. */
  slowedBy: Terrain[];
  /** Miles over water, which depend on a vessel and are left out of hours and days. */
  waterborneMiles: number;
}

/** How long a route takes at a pace, leg by leg, each leg limited by its terrain's maximum pace. */
export function journeyTime(legs: readonly JourneyLeg[], pace: Pace): Journey {
  const out: Journey = { miles: 0, hours: 0, days: 0, slowedBy: [], waterborneMiles: 0 };
  for (const leg of legs) {
    out.miles += leg.miles;
    const actual = effectivePace(leg.terrain, pace);
    if (!actual) {
      out.waterborneMiles += leg.miles;
      continue;
    }
    if (leg.terrain && actual !== pace && !out.slowedBy.includes(leg.terrain)) out.slowedBy.push(leg.terrain);
    out.hours += leg.miles / TRAVEL_PACE[actual].milesPerHour;
    out.days += leg.miles / TRAVEL_PACE[actual].milesPerDay;
  }
  return out;
}

// WEATHER (SRD "Environmental Effects") ---------------------------------------------------------------------

export type WeatherSeverity = 'calm' | 'harsh' | 'hazard';

export interface WeatherInfo {
  label: string;
  severity: WeatherSeverity;
  /** Game effects in plain words, each a reminder for the table. */
  effects: readonly string[];
}

export const WEATHER_INFO: Record<Weather, WeatherInfo> = {
  clear: { label: 'Clear', severity: 'calm', effects: [] },
  overcast: { label: 'Overcast', severity: 'calm', effects: ['No game effect.'] },
  fog: {
    label: 'Fog',
    severity: 'harsh',
    effects: [
      'Patchy fog is Lightly Obscured: disadvantage on Wisdom (Perception) checks that rely on sight.',
      'Heavy fog is Heavily Obscured: a creature trying to see into it has the Blinded condition.',
    ],
  },
  rain: { label: 'Rain', severity: 'calm', effects: ['Light rain has no game effect.'] },
  heavy_rain: {
    label: 'Heavy rain',
    severity: 'harsh',
    effects: ['Lightly Obscured, and disadvantage on all Wisdom (Perception) checks.', 'Open flames are put out.'],
  },
  thunderstorm: {
    label: 'Thunderstorm',
    severity: 'harsh',
    effects: [
      'Heavy rain and strong wind together: Lightly Obscured, disadvantage on Wisdom (Perception) checks and on ranged weapon attacks, open flames are put out, and flyers must land or fall.',
      'Lightning strikes are not an SRD rule: the DM decides.',
    ],
  },
  snow: {
    label: 'Heavy snow',
    severity: 'harsh',
    effects: ['Lightly Obscured, and disadvantage on all Wisdom (Perception) checks.'],
  },
  blizzard: {
    label: 'Blizzard',
    severity: 'hazard',
    effects: [
      'Heavy snow and strong wind: Lightly Obscured, disadvantage on Wisdom (Perception) checks and on ranged weapon attacks, open flames are put out, and flyers must land or fall.',
      'At 0 °F or below, a DC 10 Constitution save at the end of each hour or gain 1 Exhaustion level (automatic success with Resistance or Immunity to Cold damage).',
    ],
  },
  hail: {
    label: 'Hail',
    severity: 'harsh',
    effects: [
      'Hail is not an SRD rule. A fair ruling: treat it like heavy precipitation (Lightly Obscured, disadvantage on Wisdom (Perception) checks).',
    ],
  },
  sandstorm: {
    label: 'Sandstorm',
    severity: 'hazard',
    effects: [
      'Strong wind in the desert: disadvantage on Wisdom (Perception) checks.',
      'Plus strong wind: disadvantage on ranged weapon attacks, open flames are put out, fog disperses, and flyers must land or fall.',
    ],
  },
  strong_wind: {
    label: 'Strong wind',
    severity: 'harsh',
    effects: [
      'Disadvantage on ranged attack rolls with weapons.',
      'Open flames are put out and fog disperses.',
      'A flying creature must land at the end of its turn or fall.',
    ],
  },
  extreme_heat: {
    label: 'Extreme heat',
    severity: 'hazard',
    effects: [
      'At 100 °F or above, without drinkable water: a Constitution save at the end of each hour (DC 5, +1 each further hour) or gain 1 Exhaustion level.',
      'Medium or Heavy armor gives disadvantage on the save; Resistance or Immunity to Fire damage means automatic success.',
    ],
  },
  extreme_cold: {
    label: 'Extreme cold',
    severity: 'hazard',
    effects: [
      'At 0 °F or below: a DC 10 Constitution save at the end of each hour or gain 1 Exhaustion level.',
      'Resistance or Immunity to Cold damage means automatic success.',
    ],
  },
};

/**
 * Picks today's weather for a terrain from what it usually sees, weighted towards the first (most common) ones.
 * `random` is a number in [0, 1), so tests and seeded rolls can pass their own.
 */
export function rollWeather(terrain: Terrain, random: number = Math.random()): Weather {
  const options = TERRAIN_INFO[terrain].typicalWeather;
  // weights n, n-1, ..., 1: the most common weather is n times as likely as the rarest
  const weights = options.map((_, i) => options.length - i);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.min(Math.max(random, 0), 0.999999) * total;
  for (let i = 0; i < options.length; i++) {
    r -= weights[i];
    if (r < 0) return options[i];
  }
  return options[options.length - 1];
}

export function isTerrain(value: string): value is Terrain {
  return (TERRAINS as readonly string[]).includes(value);
}

export function isWeather(value: string): value is Weather {
  return (WEATHERS as readonly string[]).includes(value);
}
