// P4-4: a player's handouts (in the Pack): everything the DM has shown them, newest first, with a "new" marker until
// opened. Any of them can be read again at any time.
import { Image as ImageIcon, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../auth/authContext';
import { friendlyMessage } from '../../data/errors';
import { isNewFor } from '../../data/handouts';
import { useHandouts, useMarkHandoutSeen } from '../../hooks/useHandouts';
import type { HandoutImageStore } from '../../lib/storage';
import { ICON_PROPS, iconClasses } from '../ui';
import { HandoutViewer } from './HandoutViewer';
import styles from './Handouts.module.css';

export function HandoutList({
  campaignId,
  store,
  className,
  headingClassName,
}: {
  campaignId: string;
  store?: HandoutImageStore;
  className?: string;
  headingClassName?: string;
}) {
  const { session } = useAuth();
  const me = session?.user.id;
  const handouts = useHandouts(campaignId);
  const markSeen = useMarkHandoutSeen(campaignId);
  const [reading, setReading] = useState<string | null>(null);

  // only the handouts shown to this person (a DM previewing the player view sees none of the library here)
  const mine = (handouts.data ?? []).filter(h => h.shares.some(s => s.userId === me));
  const open = mine.find(h => h.id === reading);
  const unread = mine.filter(h => isNewFor(h, me)).length;

  return (
    <section aria-labelledby="handouts-heading" className={className}>
      <h2 id="handouts-heading" className={headingClassName}>
        Handouts
        {unread > 0 && <span className="visually-hidden">{`, ${unread} new`}</span>}
      </h2>
      {handouts.isError ? (
        <p role="alert">{friendlyMessage(handouts.error)}</p>
      ) : !handouts.data ? (
        <p className={styles.muted}>Looking through your handouts…</p>
      ) : mine.length === 0 ? (
        <p className={styles.muted}>Nothing yet. When the DM shows you a letter, a map or a riddle, it is kept here.</p>
      ) : (
        <ul className={styles.list}>
          {mine.map(h => {
            const isNew = isNewFor(h, me);
            const Icon = h.kind === 'image' ? ImageIcon : ScrollText;
            return (
              <li key={h.id}>
                <button
                  type="button"
                  className={`${styles.item} ${iconClasses.host}`}
                  onClick={() => {
                    if (isNew) markSeen.mutate(h.id);
                    setReading(h.id);
                  }}
                >
                  <Icon {...ICON_PROPS} className={iconClasses.icon} />
                  <span className={styles.itemTitle}>{h.title}</span>
                  {isNew && <span className={styles.new}>new</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && <HandoutViewer handout={open} store={store} onClose={() => setReading(null)} />}
    </section>
  );
}
