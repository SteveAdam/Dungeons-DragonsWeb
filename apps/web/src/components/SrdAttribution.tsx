// P2-3: the SRD 5.2.1 attribution statement, word for word, under every page (see ATTRIBUTION.md). The licence
// asks for the statement itself, so the URLs stay written out in it.
// the attribution entry point alone: the package's main entry would load every SRD record into each page
import { SRD_ATTRIBUTION } from '@dnd-manager/srd-data/attribution';

export function SrdAttribution() {
  return <p aria-label="SRD attribution">{SRD_ATTRIBUTION}</p>;
}
