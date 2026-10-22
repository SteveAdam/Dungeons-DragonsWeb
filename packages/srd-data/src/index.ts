// P2-3: SRD 5.2.1 equipment data, validated on import.
//
// This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast
// LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons
// Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
import armorJson from '../data/armor.json';
import backgroundsJson from '../data/backgrounds.json';
import classesJson from '../data/classes.json';
import currencyJson from '../data/currency.json';
import speciesJson from '../data/species.json';
import spellsJson from '../data/spells.json';
import weaponsJson from '../data/weapons.json';
import {
  armorSchema,
  backgroundSchema,
  classSchema,
  currencySchema,
  speciesSchema,
  spellSchema,
  weaponSchema,
} from './schemas';

export * from './schemas';

/** The SRD's attribution statement, word for word (see ATTRIBUTION.md at the repo root). */
export const SRD_ATTRIBUTION =
  'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

export const SRD_WEAPONS = weaponSchema.array().parse(weaponsJson);
export const SRD_ARMOR = armorSchema.array().parse(armorJson);
export const SRD_CURRENCY = currencySchema.parse(currencyJson);

// P2-4: classes (levels 1 to 3), species and backgrounds.
export const SRD_CLASSES = classSchema.array().parse(classesJson);
export const SRD_SPECIES = speciesSchema.array().parse(speciesJson);
export const SRD_BACKGROUNDS = backgroundSchema.array().parse(backgroundsJson);

// P2-5: SRD spells, imported in batches by level (see spellSources.ts).
export const SRD_SPELLS = spellSchema.array().parse(spellsJson);
