import { DEFAULT_DAYLIGHT, SKILLS, spawnRuleSummary, type ContentKind } from '@dnd-manager/rules-engine';
import { Copy, Dices, Pencil, Plus, Sun } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, ICON_PROPS, iconClasses, Input, RibbonTabs, Tag } from '../../../components/ui';
import { friendlyMessage } from '../../../data/errors';
import { encounterLogLine, type EncounterRoll, type RegionContent } from '../../../data/regionContent';
import type { Region } from '../../../data/regions';
import { useCampaign } from '../../../hooks/useCampaigns';
import { useRegionContent, useRollEncounter, useSetDaylight } from '../../../hooks/useRegionContent';
import mapStyles from '../MapView.module.css';
import styles from './content.module.css';
import { ContentForm } from './ContentForm';
import { KIND_LABELS, STATE_LABELS } from './contentLabels';

type TabId = 'creatures' | 'folk' | 'finds' | 'shops';
const TABS: { id: TabId; label: string; kinds: readonly ContentKind[] }[] = [
  { id: 'creatures', label: 'Creatures', kinds: ['creature'] },
  { id: 'folk', label: 'Folk', kinds: ['folk'] },
  { id: 'finds', label: 'Finds', kinds: ['find', 'interactable'] },
  { id: 'shops', label: 'Shops', kinds: ['shop'] },
];

function EntryRow({ entry, onEdit }: { entry: RegionContent; onEdit: () => void }) {
  const meta = [
    entry.kind === 'interactable' ? KIND_LABELS.interactable : null,
    entry.discoveryDc !== null ? `DC ${entry.discoveryDc} ${SKILLS[entry.discoverySkill].label}` : null,
    spawnRuleSummary(entry.spawnRule),
    entry.hintText ? `Hint: ${entry.hintText}` : null,
  ].filter(Boolean);
  return (
    <li className={styles.entry}>
      <span className={styles.entryName}>
        {entry.name} <Tag>{STATE_LABELS[entry.state].toUpperCase()}</Tag>
      </span>
      <Button variant="ghost" aria-label={`Edit ${entry.name}`} onClick={onEdit}>
        <Pencil {...ICON_PROPS} />
      </Button>
      <p className={styles.meta}>{meta.join(' · ')}</p>
    </li>
  );
}

function DaylightHours({ campaignId }: { campaignId: string }) {
  const id = useId();
  const campaign = useCampaign(campaignId);
  const setDaylight = useSetDaylight(campaignId);
  const current = campaign.data?.daylight ?? DEFAULT_DAYLIGHT;
  const [draft, setDraft] = useState<{ start: string; end: string } | null>(null);
  const shown = draft ?? { start: String(current.start), end: String(current.end) };
  return (
    <form
      className={styles.daylight}
      aria-label="Daylight hours"
      onSubmit={e => {
        e.preventDefault();
        setDaylight.mutate({ start: Number(shown.start), end: Number(shown.end) }, { onSuccess: () => setDraft(null) });
      }}
    >
      <div className={mapStyles.field}>
        <label htmlFor={`${id}-start`}>Day starts (hour)</label>
        <Input
          id={`${id}-start`}
          type="number"
          min={0}
          max={23}
          value={shown.start}
          onChange={e => setDraft({ ...shown, start: e.target.value })}
        />
      </div>
      <div className={mapStyles.field}>
        <label htmlFor={`${id}-end`}>Night starts (hour)</label>
        <Input
          id={`${id}-end`}
          type="number"
          min={0}
          max={23}
          value={shown.end}
          onChange={e => setDraft({ ...shown, end: e.target.value })}
        />
      </div>
      <Button type="submit" variant="ghost" className={iconClasses.host} disabled={!draft || setDaylight.isPending}>
        <Sun {...ICON_PROPS} className={iconClasses.icon} />
        Save daylight
      </Button>
      {setDaylight.error && (
        <p role="alert" className={mapStyles.error}>
          {friendlyMessage(setDaylight.error)}
        </p>
      )}
    </form>
  );
}

function EncounterRoller({ region, campaignId }: { region: Region; campaignId: string }) {
  const roll = useRollEncounter();
  const [result, setResult] = useState<EncounterRoll | null>(null);
  const [copied, setCopied] = useState(false);
  const line = result ? encounterLogLine(region.name, result) : '';
  return (
    <div className={mapStyles.form}>
      <Button
        className={iconClasses.host}
        disabled={roll.isPending}
        onClick={() =>
          roll.mutate(region.id, {
            onSuccess: r => {
              setResult(r);
              setCopied(false);
            },
          })
        }
      >
        <Dices {...ICON_PROPS} className={iconClasses.icon} />
        {roll.isPending ? 'Rolling…' : 'Roll random encounter'}
      </Button>
      {result && (
        <section aria-label="Encounter result" className={styles.result} aria-live="polite">
          {result.results.length === 0 ? (
            <p className={mapStyles.prose}>Nothing turns up.</p>
          ) : (
            <ul className={styles.list}>
              {result.results.map(r => (
                <li key={r.contentId}>{`${r.name} × ${r.count}${r.monsterRef ? ` (${r.monsterRef})` : ''}`}</li>
              ))}
            </ul>
          )}
          <p className={styles.logLine}>{line}</p>
          <Button
            variant="ghost"
            className={iconClasses.host}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(line);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            <Copy {...ICON_PROPS} className={iconClasses.icon} />
            {copied ? 'Copied' : 'Copy log line'}
          </Button>
        </section>
      )}
      {roll.error && (
        <p role="alert" className={mapStyles.error}>
          {friendlyMessage(roll.error)}
        </p>
      )}
      <DaylightHours campaignId={campaignId} />
    </div>
  );
}

/**
 * What lives in a region (REG-1 to REG-3, REG-5), for a DM in DM mode only: tabs of creatures, folk, finds and
 * shops, each entry with its discovery state, DC and spawn rule; the entry form; and the random encounter roll.
 * Players never render this, so they never request it.
 */
export function RegionContentSection({ region, campaignId }: { region: Region; campaignId: string }) {
  const content = useRegionContent([region.id], true);
  const [tab, setTab] = useState<TabId>('creatures');
  const [editing, setEditing] = useState<{ entry?: RegionContent; kind: ContentKind } | null>(null);
  const current = TABS.find(t => t.id === tab) ?? TABS[0];
  const entries = (content.data ?? []).filter(e => current.kinds.includes(e.kind));

  return (
    <section aria-label="Region content" className={styles.section}>
      <h3 className={styles.title}>In this region</h3>
      <RibbonTabs
        aria-label="Region content"
        tabs={TABS.map(t => ({ id: t.id, label: t.label }))}
        value={tab}
        onChange={id => {
          setTab(id as TabId);
          setEditing(null);
        }}
      />
      <div role="tabpanel" aria-label={current.label} className={mapStyles.form}>
        {editing ? (
          <ContentForm
            key={editing.entry?.id ?? `new-${editing.kind}`}
            regionId={region.id}
            campaignId={campaignId}
            entry={editing.entry}
            kind={editing.kind}
            kinds={current.kinds}
            onDone={() => setEditing(null)}
          />
        ) : (
          <>
            {content.isPending ? (
              <p role="status">Gathering what lives here…</p>
            ) : content.isError ? (
              <p role="alert" className={mapStyles.error}>
                {friendlyMessage(content.error)}
              </p>
            ) : entries.length === 0 ? (
              <p className={mapStyles.prose}>{`No ${current.label.toLowerCase()} here yet.`}</p>
            ) : (
              <ul className={styles.list}>
                {entries.map(e => (
                  <EntryRow key={e.id} entry={e} onEdit={() => setEditing({ entry: e, kind: e.kind })} />
                ))}
              </ul>
            )}
            <Button variant="ghost" className={iconClasses.host} onClick={() => setEditing({ kind: current.kinds[0] })}>
              <Plus {...ICON_PROPS} className={iconClasses.icon} />
              {`Add ${KIND_LABELS[current.kinds[0]].toLowerCase()}`}
            </Button>
            {tab === 'creatures' && <EncounterRoller region={region} campaignId={campaignId} />}
          </>
        )}
      </div>
    </section>
  );
}
