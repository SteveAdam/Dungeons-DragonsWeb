import { useDmIndicator } from '../state/dmIndicator';
import { DmBanner } from './ui';

/** Lives in the header: the DM banner (top rule and badge), shown only while a page reports DM mode on. */
export function DmModeIndicator() {
  const active = useDmIndicator(s => s.active);
  return active ? <DmBanner /> : null;
}
