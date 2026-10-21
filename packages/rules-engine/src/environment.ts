// Terrain and weather for map regions (EXL-3). The effects paraphrase the environment rules of the SRD 5.2
// (CC-BY-4.0); the DM always has the last word, so these are reminders, not automation.
// The keys match the check constraints on public.regions (supabase/migrations/0003_regions.sql).

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

export interface TerrainInfo {
  label: string;
  /** Overland travel through it counts as difficult terrain: half the usual distance per day. */
  difficult: boolean;
  /** What the land is like, for the DM to read out or build on. */
  note: string;
  /** The weather this land usually sees, most common first. "Roll weather" picks from these. */
  typicalWeather: readonly Weather[];
}

export const TERRAIN_INFO: Record<Terrain, TerrainInfo> = {
  arctic: {
    label: 'Arctic',
    difficult: true,
    note: 'Ice sheets and deep snow. Slippery ice and thin ice are common hazards.',
    typicalWeather: ['extreme_cold', 'snow', 'blizzard', 'strong_wind', 'clear'],
  },
  tundra: {
    label: 'Tundra',
    difficult: false,
    note: 'Treeless, frozen plains with little shelter from the wind.',
    typicalWeather: ['extreme_cold', 'strong_wind', 'snow', 'overcast', 'clear'],
  },
  boreal_forest: {
    label: 'Boreal forest',
    difficult: true,
    note: 'Dense pine and spruce under long winters; snow lies deep between the trees.',
    typicalWeather: ['snow', 'overcast', 'extreme_cold', 'fog', 'clear'],
  },
  temperate_forest: {
    label: 'Temperate forest',
    difficult: false,
    note: 'Oak and beech woods with paths and clearings; thick undergrowth off the trails.',
    typicalWeather: ['clear', 'overcast', 'rain', 'fog', 'thunderstorm'],
  },
  jungle: {
    label: 'Jungle',
    difficult: true,
    note: 'Steaming, tangled growth. Visibility rarely goes beyond a few dozen feet.',
    typicalWeather: ['heavy_rain', 'thunderstorm', 'rain', 'extreme_heat', 'fog'],
  },
  grassland: {
    label: 'Grassland',
    difficult: false,
    note: 'Open plains; you see trouble coming from far off, and it sees you.',
    typicalWeather: ['clear', 'strong_wind', 'overcast', 'thunderstorm', 'hail'],
  },
  farmland: {
    label: 'Farmland',
    difficult: false,
    note: 'Fields, hedgerows and villages linked by cart roads.',
    typicalWeather: ['clear', 'overcast', 'rain', 'fog'],
  },
  hills: {
    label: 'Hills',
    difficult: true,
    note: 'Rolling high ground, good for watchtowers and ambushes.',
    typicalWeather: ['clear', 'overcast', 'strong_wind', 'rain', 'fog'],
  },
  mountains: {
    label: 'Mountains',
    difficult: true,
    note: 'Steep climbs. Above 10,000 feet the air is thin and travel is exhausting.',
    typicalWeather: ['strong_wind', 'snow', 'extreme_cold', 'clear', 'blizzard'],
  },
  desert: {
    label: 'Desert',
    difficult: false,
    note: 'Dunes and salt flats; water is the first thing to run out.',
    typicalWeather: ['extreme_heat', 'clear', 'sandstorm', 'strong_wind'],
  },
  badlands: {
    label: 'Badlands',
    difficult: true,
    note: 'Eroded canyons and mesas; easy to get lost, easy to get trapped.',
    typicalWeather: ['clear', 'extreme_heat', 'strong_wind', 'thunderstorm'],
  },
  swamp: {
    label: 'Swamp',
    difficult: true,
    note: 'Mud, reeds and stagnant water; insects and worse.',
    typicalWeather: ['fog', 'rain', 'overcast', 'extreme_heat', 'heavy_rain'],
  },
  coast: {
    label: 'Coast',
    difficult: false,
    note: 'Cliffs, coves and beaches. Tides can cut off a path within the hour.',
    typicalWeather: ['strong_wind', 'fog', 'clear', 'rain', 'thunderstorm'],
  },
  sea: {
    label: 'Open sea',
    difficult: false,
    note: 'Travel by ship. Frigid water saps a swimmer quickly.',
    typicalWeather: ['clear', 'strong_wind', 'thunderstorm', 'fog', 'heavy_rain'],
  },
  volcanic: {
    label: 'Volcanic',
    difficult: true,
    note: 'Ash fields, lava tubes and vents of poisonous gas.',
    typicalWeather: ['extreme_heat', 'overcast', 'strong_wind', 'clear'],
  },
  underdark: {
    label: 'Underdark',
    difficult: true,
    note: 'Endless caverns without daylight; darkness is the norm, not the weather.',
    typicalWeather: ['clear', 'fog'],
  },
  urban: {
    label: 'City',
    difficult: false,
    note: 'Streets, markets and alleys; shelter is never far away.',
    typicalWeather: ['clear', 'overcast', 'rain', 'fog'],
  },
};

export type WeatherSeverity = 'calm' | 'harsh' | 'hazard';

export interface WeatherInfo {
  label: string;
  severity: WeatherSeverity;
  /** Game effects in plain words, each a reminder for the table. */
  effects: readonly string[];
}

export const WEATHER_INFO: Record<Weather, WeatherInfo> = {
  clear: { label: 'Clear', severity: 'calm', effects: [] },
  overcast: { label: 'Overcast', severity: 'calm', effects: ['Dim, grey light; no other effect.'] },
  fog: {
    label: 'Fog',
    severity: 'harsh',
    effects: ['The area is heavily obscured: creatures in it are effectively blinded beyond a few feet.'],
  },
  rain: {
    label: 'Rain',
    severity: 'calm',
    effects: ['Light rain: no game effect, but tracks wash out over time.'],
  },
  heavy_rain: {
    label: 'Heavy rain',
    severity: 'harsh',
    effects: [
      'Lightly obscured: disadvantage on Wisdom (Perception) checks that rely on sight.',
      'Open flames go out; disadvantage on Wisdom (Perception) checks that rely on hearing.',
    ],
  },
  thunderstorm: {
    label: 'Thunderstorm',
    severity: 'harsh',
    effects: [
      'As heavy rain, plus strong wind.',
      'Lightning can strike the highest point nearby: a good moment for a Dexterity save.',
    ],
  },
  snow: {
    label: 'Snow',
    severity: 'harsh',
    effects: [
      'Heavy snowfall is lightly obscured: disadvantage on sight-based Perception.',
      'Deep snow is difficult terrain.',
    ],
  },
  blizzard: {
    label: 'Blizzard',
    severity: 'hazard',
    effects: [
      'Heavy snow and strong wind together: lightly obscured, open flames go out, ranged attacks have disadvantage.',
      'Extreme cold: a Constitution save (DC 10) each hour or gain 1 Exhaustion level, unless dressed for it.',
    ],
  },
  hail: {
    label: 'Hail',
    severity: 'harsh',
    effects: [
      'Lightly obscured, and loud: disadvantage on hearing-based Perception. Large hail can deal bludgeoning damage.',
    ],
  },
  sandstorm: {
    label: 'Sandstorm',
    severity: 'hazard',
    effects: [
      'Heavily obscured beyond a few feet; ranged attacks have disadvantage.',
      'Travelling through it is difficult terrain, and exposed flames go out.',
    ],
  },
  strong_wind: {
    label: 'Strong wind',
    severity: 'harsh',
    effects: [
      'Disadvantage on ranged weapon attack rolls.',
      'Open flames go out and fog disperses.',
      'Flying creatures without magic must land at the end of their turn or fall.',
    ],
  },
  extreme_heat: {
    label: 'Extreme heat',
    severity: 'hazard',
    effects: [
      'Without water, a Constitution save each hour (DC 5, +1 per hour) or gain 1 Exhaustion level.',
      'Medium or heavy armour or heavy clothing gives disadvantage on the save.',
    ],
  },
  extreme_cold: {
    label: 'Extreme cold',
    severity: 'hazard',
    effects: [
      'A Constitution save (DC 10) each hour or gain 1 Exhaustion level, unless dressed for the cold or resistant to cold.',
    ],
  },
};

/** Hours of travel per day at a normal pace, and the miles covered on open ground (SRD 5.2 travel pace). */
export const MILES_PER_DAY = { slow: 18, normal: 24, fast: 30 } as const;

/** Miles a day's travel covers in this terrain: difficult terrain halves it. */
export function milesPerDay(terrain: Terrain, pace: keyof typeof MILES_PER_DAY = 'normal'): number {
  const miles = MILES_PER_DAY[pace];
  return TERRAIN_INFO[terrain].difficult ? miles / 2 : miles;
}

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
