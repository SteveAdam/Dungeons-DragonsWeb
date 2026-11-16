// P4-4: when the DM shows a player a handout, a parchment note appears wherever the player is in the campaign. "Read
// it" opens the handout (and it stops being new); "Later" keeps it in the Handouts list, marked new until opened.
// The live event is the fast path; the list is also read on load and every 20 seconds, so a handout shown while the
// player was away (or whose event was lost) still pops up. Mounted once, in the app shell.
import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../auth/authContext';
import { isNewFor, shareFor, type Handout } from '../../data/handouts';
import { useHandoutArrivals, useHandouts, useMarkHandoutSeen } from '../../hooks/useHandouts';
import type { HandoutImageStore } from '../../lib/storage';
import { Button, ICON_PROPS, iconClasses } from '../ui';
import { HandoutDialog } from './HandoutDialog';
import { HandoutImage, HandoutViewer } from './HandoutViewer';
import styles from './Handouts.module.css';

export function HandoutNotice({
  handout,
  onOpen,
  onLater,
  store,
}: {
  handout: Handout;
  onOpen: () => void;
  onLater: () => void;
  store?: HandoutImageStore;
}) {
  return (
    <HandoutDialog title={handout.title} kicker="The DM shows you a handout" onClose={onLater}>
      {handout.kind === 'text' ? (
        <p className={`${styles.text} ${styles.preview}`}>{handout.body}</p>
      ) : (
        handout.imagePath && (
          <HandoutImage path={handout.imagePath} alt={handout.title} store={store} className={styles.thumb} />
        )
      )}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onLater}>
          Later
        </Button>
        <Button data-autofocus className={iconClasses.host} onClick={onOpen}>
          <ScrollText {...ICON_PROPS} className={iconClasses.icon} />
          Read it
        </Button>
      </div>
    </HandoutDialog>
  );
}

// "Later" is remembered in this browser per showing (handout and when it was shown), so a handout shown again pops up
// again. Storage can be unavailable (private windows): then "Later" lasts until the page is reloaded.
const LATER_KEY = 'dnd-manager:handouts-later';
const showingKey = (h: Handout, me: string | undefined) => `${h.id}@${shareFor(h, me)?.sharedAt ?? ''}`;

function readLater(): Set<string> {
  try {
    const raw = localStorage.getItem(LATER_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeLater(keys: ReadonlySet<string>) {
  try {
    // only the latest few hundred matter: older showings are long opened or taken back
    localStorage.setItem(LATER_KEY, JSON.stringify([...keys].slice(-300)));
  } catch {
    // storage is off: "Later" is kept in memory only
  }
}

/** How often a player's screen checks for handouts it was not told about live (missed while offline, say). */
const RECHECK_MS = 20_000;

export function HandoutPopup({ campaignId, store }: { campaignId: string; store?: HandoutImageStore }) {
  const { session } = useAuth();
  const me = session?.user.id;
  useHandoutArrivals(campaignId);
  const handouts = useHandouts(campaignId, true, RECHECK_MS);
  const markSeen = useMarkHandoutSeen(campaignId);
  const [reading, setReading] = useState<string | null>(null);
  const [later, setLater] = useState<ReadonlySet<string>>(readLater);

  const open = reading ? handouts.data?.find(h => h.id === reading) : undefined;
  if (open) return <HandoutViewer handout={open} store={store} onClose={() => setReading(null)} />;

  // the earliest-shown handout that is this person's, still new, and not put off with "Later" (one the DM took back
  // is no longer in the list)
  const next = (handouts.data ?? [])
    .filter(h => isNewFor(h, me) && !later.has(showingKey(h, me)))
    .sort((a, b) => (shareFor(a, me)?.sharedAt ?? '').localeCompare(shareFor(b, me)?.sharedAt ?? ''))[0];
  if (!next) return null;
  return (
    <HandoutNotice
      key={next.id}
      handout={next}
      store={store}
      onLater={() => {
        const keys = new Set(later).add(showingKey(next, me));
        setLater(keys);
        writeLater(keys);
      }}
      onOpen={() => {
        markSeen.mutate(next.id);
        setReading(next.id);
      }}
    />
  );
}
