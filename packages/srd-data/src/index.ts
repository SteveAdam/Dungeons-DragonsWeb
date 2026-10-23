// The SRD 5.2.1 data, validated on import. Importing this entry parses every data file; screens that need only
// the attribution or the equipment import "./attribution" or "./equipment" (package subpaths) instead.
//
// This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast
// LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons
// Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
import backgroundsJson from '../data/backgrounds.json';
import classesJson from '../data/classes.json';
import speciesJson from '../data/species.json';
import spellsJson from '../data/spells.json';
import { backgroundSchema, classSchema, speciesSchema, spellSchema } from './schemas';

export * from './attribution';
export * from './equipment';
export * from './schemas';

// P2-4: classes (levels 1 to 3), species and backgrounds.
export const SRD_CLASSES = classSchema.array().parse(classesJson);
export const SRD_SPECIES = speciesSchema.array().parse(speciesJson);
export const SRD_BACKGROUNDS = backgroundSchema.array().parse(backgroundsJson);

// P2-5: SRD spells, imported in batches by level (see spellSources.ts).
export const SRD_SPELLS = spellSchema.array().parse(spellsJson);
