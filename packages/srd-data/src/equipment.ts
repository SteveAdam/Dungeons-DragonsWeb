// P2-3: SRD 5.2.1 weapons, armour and coins on their own, validated on import, for screens that need only the
// equipment (the DM's item tools) without parsing the classes, species, backgrounds and spells.
//
// This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast
// LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons
// Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
import armorJson from '../data/armor.json';
import currencyJson from '../data/currency.json';
import weaponsJson from '../data/weapons.json';
import { armorSchema, currencySchema, weaponSchema } from './schemas';

export const SRD_WEAPONS = weaponSchema.array().parse(weaponsJson);
export const SRD_ARMOR = armorSchema.array().parse(armorJson);
export const SRD_CURRENCY = currencySchema.parse(currencyJson);
