import { useQuery } from '@tanstack/react-query';
import { listSrdArmor, listSrdClasses, listSrdMonsters, listSrdSpells, listSrdWeapons } from '../data/srd';

// The SRD never changes during a session, so each list is read once. A shelf asks only when it is open: the
// monsters alone are nearly a megabyte.
const srdList = <T>(what: string, queryFn: () => Promise<T>, enabled: boolean) => ({
  queryKey: ['srd', what],
  queryFn,
  enabled,
  staleTime: Infinity,
});

export const useSrdSpells = (enabled = true) => useQuery(srdList('spells', listSrdSpells, enabled));
export const useSrdClasses = (enabled = true) => useQuery(srdList('classes', listSrdClasses, enabled));
export const useSrdMonsters = (enabled = true) => useQuery(srdList('monsters', listSrdMonsters, enabled));
export const useSrdWeapons = (enabled = true) => useQuery(srdList('weapons', listSrdWeapons, enabled));
export const useSrdArmor = (enabled = true) => useQuery(srdList('armor', listSrdArmor, enabled));
