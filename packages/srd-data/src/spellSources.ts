// P2-5: which SRD spells are imported. The converter reads every spell in the chapter; the ticket asks for them in
// batches, each checked against the SRD before the next: cantrips, then levels 1, 2 and 3, plus two higher-level
// spells the library mockups use (P2-5). The library (P3-5) lists every spell, so all nine levels now ship.
export const SPELL_PAGES = '107-175';

export const SPELL_BATCH: { maxLevel: number; extras: string[] } = {
  maxLevel: 9,
  extras: [],
};
