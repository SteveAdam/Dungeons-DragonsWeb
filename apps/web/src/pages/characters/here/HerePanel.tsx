import type { ContentKind } from '@dnd-manager/rules-engine';
import { Compass, Eye, Hand, MessageCircle, Search, ShoppingBag, Swords, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OddsPopup, type OddsCheck } from '../../../components/odds/OddsPopup';
import { Button, ICON_PROPS, iconClasses, Paper, Tag } from '../../../components/ui';
import { WeatherCard } from '../../../components/WeatherCard';
import { friendlyMessage } from '../../../data/errors';
import type { HereEntry, SearchResult } from '../../../data/here';
import { useRollPreview } from '../../../hooks/useCharacters';
import { useDiscoveryNotices, useHere, useSearchHere } from '../../../hooks/useHere';
import styles from './HerePanel.module.css';

/** The order of the sections, as on the mockup: people first, then danger, then things. */
const SECTIONS: { kind: ContentKind; label: string }[] = [
  { kind: 'folk', label: 'Folk' },
  { kind: 'creature', label: 'Creatures' },
  { kind: 'interactable', label: 'Interactables' },
  { kind: 'find', label: 'Finds' },
  { kind: 'shop', label: 'Shops' },
];

const NOTICE_MS = 6000;

function EntryActions({ entry }: { entry: HereEntry }) {
  const [examined, setExamined] = useState(false);
  return (
    <>
      <div className={styles.actions}>
        {entry.actions.includes('talk') && (
          <Button variant="ghost" className={iconClasses.host} disabled title="Talking comes in a later update">
            <MessageCircle {...ICON_PROPS} className={iconClasses.icon} />
            Talk
          </Button>
        )}
        {entry.actions.includes('act') && (
          <Button variant="ghost" className={iconClasses.host} disabled title="Acting comes with combat">
            <Swords {...ICON_PROPS} className={iconClasses.icon} />
            Act
          </Button>
        )}
        {entry.actions.includes('examine') && (
          <Button
            variant="ghost"
            className={iconClasses.host}
            aria-expanded={examined}
            onClick={() => setExamined(e => !e)}
          >
            <Eye {...ICON_PROPS} className={iconClasses.icon} />
            Examine
          </Button>
        )}
        {entry.actions.includes('buy') && (
          <Button variant="ghost" className={iconClasses.host} disabled title="Buying comes in a later update">
            <ShoppingBag {...ICON_PROPS} className={iconClasses.icon} />
            Buy
          </Button>
        )}
      </div>
      {examined && <p className={styles.prose}>{entry.description || 'Nothing more to see.'}</p>}
    </>
  );
}

/** The search roll: the server's Perception bonus, odds hidden, then the server's search. */
function SearchOdds({
  campaignId,
  characterId,
  anchor,
  onDone,
  onClose,
}: {
  campaignId: string;
  characterId: string;
  anchor: HTMLElement | null;
  onDone: (result: SearchResult) => void;
  onClose: () => void;
}) {
  const preview = useRollPreview({ campaignId, characterId, kind: 'check', key: 'perception', target: 10 });
  const search = useSearchHere(campaignId, characterId);
  const p = preview.data;
  const check: OddsCheck = {
    label: 'Search the area',
    kind: 'check',
    skill: 'Perception',
    bonus: p?.bonus ?? 0,
    bonusBreakdown: p?.bonusBreakdown,
    target: 10,
    ...(p ? { server: { mode: p.mode, reasons: p.reasons, chance: p.chance, critChance: p.critChance } } : {}),
  };
  return (
    <OddsPopup
      open
      hideOdds
      check={check}
      anchor={anchor}
      onClose={onClose}
      waiting={preview.isPending ? 'Asking the server for your bonus…' : undefined}
      problem={preview.isError ? friendlyMessage(preview.error) : (p?.autoFail ?? undefined)}
      onRoll={async () => {
        const result = await search.mutateAsync();
        onDone(result);
        return result.roll;
      }}
    />
  );
}

/**
 * The Here tab (REG-4, REG-6, CHK-1): what the character's group knows about where it is. A ribbon on the right
 * edge opens it (a bottom sheet on phones). Everything listed comes masked from get_here, so hidden entries never
 * reach the browser; a search goes through the server.
 */
export function HerePanel({ campaignId, characterId }: { campaignId: string; characterId: string }) {
  const [open, setOpen] = useState(false);
  const here = useHere(characterId);
  const [searching, setSearching] = useState(false);
  const [lastSearch, setLastSearch] = useState<SearchResult['found'] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const data = here.data;

  useDiscoveryNotices(characterId, data?.group?.id, text => setNotice(text));
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <>
      <button
        type="button"
        className={`${styles.ribbon} ${iconClasses.host}`}
        aria-expanded={open}
        aria-controls="here-panel"
        onClick={() => setOpen(o => !o)}
      >
        <Compass {...ICON_PROPS} className={iconClasses.icon} />
        Here
      </button>
      <div role="status" aria-live="polite" className={styles.toast}>
        {notice}
      </div>
      {open && (
        <Paper as="aside" texture="flat" id="here-panel" aria-label="Here" className={styles.panel}>
          <header className={styles.header}>
            <h2 className={styles.title}>{data?.region?.name ?? 'Here'}</h2>
            {data?.group && <Tag>{data.group.name}</Tag>}
            <Button variant="ghost" aria-label="Close Here" onClick={() => setOpen(false)}>
              <X {...ICON_PROPS} />
            </Button>
          </header>
          {data?.group && <WeatherCard campaignId={campaignId} characterId={characterId} />}

          {here.isPending ? (
            <p role="status">Looking around…</p>
          ) : here.isError ? (
            <p role="alert" className={styles.error}>
              {friendlyMessage(here.error)}
            </p>
          ) : !data?.group ? (
            <p className={styles.prose}>You are not with a group yet. The DM puts characters into groups.</p>
          ) : !data.region ? (
            <p className={styles.prose}>Your group is not in a region the DM has placed it in.</p>
          ) : (
            <>
              {SECTIONS.map(({ kind, label }) => {
                const entries = data.entries.filter(e => e.kind === kind);
                return entries.length === 0 ? null : (
                  <section key={kind} aria-label={label} className={styles.section}>
                    <h3 className={styles.sectionTitle}>{label}</h3>
                    <ul className={styles.list}>
                      {entries.map(e => (
                        <li key={e.id} className={styles.entry}>
                          <span className={styles.name}>{e.name}</span>
                          {e.kind !== 'interactable' && e.description && (
                            <p className={styles.prose}>{e.description}</p>
                          )}
                          <EntryActions entry={e} />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
              {data.hints.length > 0 && (
                <section aria-label="Undiscovered" className={styles.section}>
                  <h3 className={styles.sectionTitle}>Undiscovered</h3>
                  <ul className={styles.list}>
                    {data.hints.map(h => (
                      <li key={h.id} className={styles.hint}>
                        <Hand {...ICON_PROPS} />
                        {h.hint}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {data.entries.length === 0 && data.hints.length === 0 && (
                <p className={styles.prose}>Nothing stands out yet.</p>
              )}
              <Button
                className={iconClasses.host}
                onClick={e => {
                  setAnchor(e.currentTarget);
                  setLastSearch(null);
                  setSearching(true);
                }}
              >
                <Search {...ICON_PROPS} className={iconClasses.icon} />
                Search
              </Button>
              {lastSearch && (
                <p className={styles.result} aria-live="polite">
                  {lastSearch.length === 0
                    ? 'You find nothing new.'
                    : `You notice ${lastSearch.map(f => f.name).join(', ')}.`}
                </p>
              )}
            </>
          )}
        </Paper>
      )}
      {searching && (
        <SearchOdds
          campaignId={campaignId}
          characterId={characterId}
          anchor={anchor}
          onDone={result => setLastSearch(result.found)}
          onClose={() => setSearching(false)}
        />
      )}
    </>
  );
}
