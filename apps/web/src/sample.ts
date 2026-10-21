import type { CharacterLike } from '@dnd-manager/rules-engine';

export const brannoc: CharacterLike = {
  name: 'Brannoc',
  className: 'Fighter',
  background: 'Veteran scout',
  level: 5,
  xp: 6500,
  abilities: {
    str: 18,
    dex: 14,
    con: 16,
    int: 10,
    wis: 12,
    cha: 11,
  },
  armor: 14,
  hp: 34,
  tempHp: 0,
  shield: 2,
  equipment: ['Longsword', 'Shield', 'Shortbow', 'Explorer’s pack'],
  activeEffects: [],
  weapon: 'Longsword',
  weaponDamage: '1d8 + 4',
};

export default brannoc;
