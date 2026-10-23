// P2-11: the DM's "Simple long rest" (a temporary tool; the full rest rules come in Phase 6), for one character or
// for the whole Party. It restores what the SRD 5.2.1's Long Rest gives; see simple_long_rest in 0017.
import { BedDouble } from 'lucide-react';
import { useState } from 'react';
import { Button, ICON_PROPS } from '../../../components/ui';
import { friendlyMessage } from '../../../data/errors';
import { useSimpleLongRest, useSimpleLongRestParty } from '../../../hooks/useSpells';
import styles from './spells.module.css';

const RESTORES = 'all hit points and Hit Point Dice, every spell slot, one level of Exhaustion; ends concentration';

export function LongRestButton({ characterId, name }: { characterId: string; name: string }) {
  const rest = useSimpleLongRest(characterId);
  const [done, setDone] = useState(false);
  return (
    <div className={styles.actions}>
      <Button
        variant="ghost"
        disabled={rest.isPending}
        onClick={() => {
          setDone(false);
          rest.mutate(undefined, { onSuccess: () => setDone(true) });
        }}
      >
        <BedDouble {...ICON_PROPS} /> Simple long rest
      </Button>
      <span role="status" className={styles.muted}>
        {rest.isError ? '' : done ? `${name} has rested: ${RESTORES}.` : ''}
      </span>
      {rest.isError && (
        <span role="alert" className={styles.alert}>
          {friendlyMessage(rest.error)}
        </span>
      )}
    </div>
  );
}

export function PartyLongRestButton({ campaignId }: { campaignId: string }) {
  const rest = useSimpleLongRestParty(campaignId);
  const [rested, setRested] = useState<number | null>(null);
  return (
    <div className={styles.actions}>
      <Button
        variant="ghost"
        disabled={rest.isPending}
        onClick={() => {
          setRested(null);
          rest.mutate(undefined, { onSuccess: n => setRested(n) });
        }}
      >
        <BedDouble {...ICON_PROPS} /> Simple long rest for the party
      </Button>
      <span role="status" className={styles.muted}>
        {rested === null ? '' : `${rested} ${rested === 1 ? 'character has' : 'characters have'} rested: ${RESTORES}.`}
      </span>
      {rest.isError && (
        <span role="alert" className={styles.alert}>
          {friendlyMessage(rest.error)}
        </span>
      )}
    </div>
  );
}
