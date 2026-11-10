// P3-5, P3-6: /campaigns/:campaignId/library, the DM's shelves of SRD and campaign spells, monsters, weapons and items.
import {
  cloneDefinition,
  customTemplate,
  spellTier,
  spellTierGap,
  TIERS_OF_PLAY,
  type CustomKind,
  type Definition,
  type TierClass,
  type TierOfPlay,
} from '@dnd-manager/rules-engine';
import type { SrdArmor, SrdMonster, SrdSpell, SrdWeapon } from '@dnd-manager/srd-data/schemas';
import { ArrowLeft, Plus, Shield, Skull, Sparkles, Swords } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import {
  Band,
  Button,
  Cell,
  ICON_PROPS,
  iconClasses,
  IconLink,
  PageGrid,
  RibbonTabs,
  SectionTitle,
} from '../../components/ui';
import type { CustomEntry } from '../../data/customContent';
import { useCampaign } from '../../hooks/useCampaigns';
import { useCustomContent } from '../../hooks/useCustomContent';
import { useDmMode } from '../../hooks/useDmMode';
import { useSrdArmor, useSrdClasses, useSrdMonsters, useSrdSpells, useSrdWeapons } from '../../hooks/useLibrary';
import { useShowDmIndicator } from '../../state/dmIndicator';
import { BalancePanel, ComparePanel } from './editor/ComparePanels';
import { CustomEditor, type EditorRequest } from './editor/CustomEditor';
import { KIND_LABELS } from './editor/customForms';
import {
  ArmorDetail,
  CustomItemDetail,
  MonsterDetail,
  SpellDetail,
  WeaponDetail,
  type EntryControls,
} from './EntryDetails';
import styles from './Library.module.css';
import {
  challengeRatings,
  filterEquipment,
  filterMonsters,
  filterSpells,
  NO_FILTERS,
  type LibraryFilters,
} from './libraryFilters';
import { LibraryShelf } from './LibraryShelf';

const TABS = [
  { id: 'spells', label: 'Spells', icon: Sparkles },
  { id: 'monsters', label: 'Monsters', icon: Skull },
  { id: 'weapons', label: 'Weapons', icon: Swords },
  { id: 'items', label: 'Items', icon: Shield },
] as const;
type TabId = (typeof TABS)[number]['id'];

const TAB_OF_KIND: Record<CustomKind, TabId> = {
  spell: 'spells',
  monster: 'monsters',
  weapon: 'weapons',
  armor: 'items',
  item: 'items',
};

const NO_CLASSES: readonly TierClass[] = [];

type WithCustom<T> = T & { custom?: CustomEntry };
type Srd = { id: string; name: string };

interface ShelfProps {
  campaignId: string;
  customs: CustomEntry[];
  customsPending: boolean;
  customsError: unknown;
  onRetryCustoms: () => void;
  filters: LibraryFilters;
  onFilters: (filters: LibraryFilters) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEditor: (request: EditorRequest) => void;
}

/** A custom entry in the shape of the SRD record its kind shows as. Its `custom` marks it, whatever else it says. */
const asRecord = <T,>(entry: CustomEntry) =>
  ({
    ...entry.definition,
    id: entry.id,
    name: entry.name,
    source: 'srd-5.2',
    custom: entry,
  }) as unknown as WithCustom<T>;

function mergeShelf<T extends { name: string }>(srd: T[] | undefined, customs: CustomEntry[], kinds: CustomKind[]) {
  const own = customs.filter(c => kinds.includes(c.kind)).map(c => asRecord<T>(c));
  return [...(srd ?? []), ...own].sort((a, b) => a.name.localeCompare(b.name)) as WithCustom<T>[];
}

function parentOf(kind: CustomKind, custom: CustomEntry, srd: readonly Srd[]) {
  const record = srd.find(s => s.id === custom.parentRef);
  return record
    ? { id: record.id, name: record.name, definition: cloneDefinition(kind, record as unknown as Definition) }
    : null;
}

const fromText = (custom: CustomEntry | undefined, srd: readonly Srd[]) => {
  const parent = srd.find(s => s.id === custom?.parentRef);
  return parent ? ` · from ${parent.name}` : '';
};

function controlsFor<T extends Srd>(
  kind: CustomKind,
  record: WithCustom<T>,
  srd: readonly Srd[],
  shelf: ShelfProps,
): EntryControls {
  return {
    custom: record.custom,
    onClone: () => {
      const definition = cloneDefinition(kind, record as unknown as Definition);
      shelf.onEditor({
        kind,
        name: `${record.name} (copy)`,
        definition,
        parent: { id: record.id, name: record.name, definition },
      });
    },
    onEdit: () => {
      const { custom } = record;
      if (custom) {
        shelf.onEditor({
          kind,
          name: custom.name,
          definition: custom.definition,
          parent: parentOf(kind, custom, srd),
          entry: custom,
        });
      }
    },
    onDeleted: () => shelf.onSelect(null),
  };
}

function TemplateButton({ kind, onEditor }: { kind: CustomKind; onEditor: ShelfProps['onEditor'] }) {
  return (
    <Button
      variant="ghost"
      className={iconClasses.host}
      onClick={() => onEditor({ kind, name: '', definition: customTemplate(kind), parent: null })}
    >
      <Plus {...ICON_PROPS} className={iconClasses.icon} />
      {`New ${KIND_LABELS[kind]} from template`}
    </Button>
  );
}

/** Under a custom entry: how it differs from its parent, and how it compares with the SRD. */
function WithPanels({
  kind,
  custom,
  srd,
  children,
}: {
  kind: CustomKind;
  custom?: CustomEntry;
  srd: readonly Srd[];
  children: ReactNode;
}) {
  if (!custom) return <>{children}</>;
  const parent = parentOf(kind, custom, srd);
  return (
    <>
      {children}
      {parent && (
        <ComparePanel
          kind={kind}
          parentName={parent.name}
          parent={parent.definition}
          variantName={custom.name}
          variant={custom.definition}
        />
      )}
      <BalancePanel kind={kind} definition={custom.definition} />
    </>
  );
}

function spellMeta(s: SrdSpell, classes: readonly TierClass[]) {
  const tier = spellTier(s, classes);
  return `${s.level === 0 ? 'Cantrip' : `L${s.level}`} · ${tier === 'unknown' ? 'tier unknown' : `tier ${tier}`}`;
}

/** What every shelf hands to LibraryShelf unchanged. */
const shared = ({ filters, onFilters, selectedId, onSelect }: ShelfProps) => ({
  filters,
  onFilters,
  selectedId,
  onSelect,
});

function SpellShelf(shelf: ShelfProps) {
  const { filters, onFilters, customs } = shelf;
  const id = useId();
  const spells = useSrdSpells();
  const classes = useSrdClasses();
  const srd = spells.data;
  const allClasses = classes.data ?? NO_CLASSES;
  const all = useMemo(() => mergeShelf(srd, customs, ['spell']), [srd, customs]);
  const entries = useMemo(() => filterSpells(all, allClasses, filters), [all, allClasses, filters]);
  const classNames = useMemo(() => [...new Set(srd?.flatMap(s => s.classes))].sort(), [srd]);

  useEffect(() => {
    if (!srd || !classes.data) return;
    const gaps = srd.flatMap(s => spellTierGap(s, classes.data) ?? []);
    if (gaps.length > 0) console.warn(`Tier of play unknown for ${gaps.length} spells: ${gaps.join('; ')}`);
  }, [srd, classes.data]);

  const toggleTier = (tier: TierOfPlay, on: boolean) =>
    onFilters({ ...filters, tiers: on ? [...filters.tiers, tier] : filters.tiers.filter(t => t !== tier) });
  const list = srd ?? [];

  return (
    <LibraryShelf
      {...shared(shelf)}
      what="spells"
      pending={spells.isPending || classes.isPending || shelf.customsPending}
      error={spells.error ?? classes.error ?? shelf.customsError}
      onRetry={() => {
        void spells.refetch();
        void classes.refetch();
        shelf.onRetryCustoms();
      }}
      total={all.length}
      entries={entries}
      meta={s => `${spellMeta(s, allClasses)}${fromText(s.custom, list)}`}
      templates={<TemplateButton kind="spell" onEditor={shelf.onEditor} />}
      detail={s => (
        <WithPanels kind="spell" custom={s.custom} srd={list}>
          <SpellDetail spell={s} classes={allClasses} controls={controlsFor('spell', s, list, shelf)} />
        </WithPanels>
      )}
      extraFilters={
        <>
          <fieldset className={styles.filterGroup}>
            <legend>Tier of play</legend>
            {TIERS_OF_PLAY.map(t => (
              <label key={t.tier} className={styles.check}>
                <input
                  type="checkbox"
                  checked={filters.tiers.includes(t.tier)}
                  onChange={e => toggleTier(t.tier, e.target.checked)}
                />{' '}
                {t.label}
              </label>
            ))}
          </fieldset>
          <div className={styles.filterField}>
            <label htmlFor={`${id}-class`}>Class</label>
            <select
              id={`${id}-class`}
              className={styles.select}
              value={filters.className}
              onChange={e => onFilters({ ...filters, className: e.target.value })}
            >
              <option value="">Any class</option>
              {classNames.map(name => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </>
      }
    />
  );
}

function MonsterShelf(shelf: ShelfProps) {
  const { campaignId, filters, onFilters, customs } = shelf;
  const id = useId();
  const monsters = useSrdMonsters();
  const srd = monsters.data;
  const list: SrdMonster[] = srd ?? [];
  const all = useMemo(() => mergeShelf(srd, customs, ['monster']), [srd, customs]);
  const entries = useMemo(() => filterMonsters(all, filters), [all, filters]);
  const ratings = useMemo(() => challengeRatings(all), [all]);
  const crPicker = (key: 'crMin' | 'crMax', label: string, anyLabel: string) => (
    <div className={styles.filterField}>
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <select
        id={`${id}-${key}`}
        className={styles.select}
        value={filters[key] ?? ''}
        onChange={e => onFilters({ ...filters, [key]: e.target.value === '' ? null : Number(e.target.value) })}
      >
        <option value="">{anyLabel}</option>
        {ratings.map(r => (
          <option key={r.value} value={r.value}>
            {`CR ${r.label}`}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <LibraryShelf
      {...shared(shelf)}
      what="monsters"
      pending={monsters.isPending || shelf.customsPending}
      error={monsters.error ?? shelf.customsError}
      onRetry={() => {
        void monsters.refetch();
        shelf.onRetryCustoms();
      }}
      total={all.length}
      entries={entries}
      meta={m => `CR ${m.challengeRating}${fromText(m.custom, list)}`}
      templates={<TemplateButton kind="monster" onEditor={shelf.onEditor} />}
      detail={m => (
        <WithPanels kind="monster" custom={m.custom} srd={list}>
          <MonsterDetail campaignId={campaignId} monster={m} controls={controlsFor('monster', m, list, shelf)} />
        </WithPanels>
      )}
      extraFilters={
        <div className={styles.crRange}>
          {crPicker('crMin', 'Lowest challenge', 'Any')}
          {crPicker('crMax', 'Highest challenge', 'Any')}
        </div>
      }
    />
  );
}

function CategoryFilter({
  filters,
  onFilters,
  options,
}: Pick<ShelfProps, 'filters' | 'onFilters'> & { options: [string, string][] }) {
  const id = useId();
  return (
    <div className={styles.filterField}>
      <label htmlFor={id}>Category</label>
      <select
        id={id}
        className={styles.select}
        value={filters.category}
        onChange={e => onFilters({ ...filters, category: e.target.value })}
      >
        <option value="">Any category</option>
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function WeaponShelf(shelf: ShelfProps) {
  const { filters, onFilters, customs } = shelf;
  const weapons = useSrdWeapons();
  const list: SrdWeapon[] = weapons.data ?? [];
  const all = useMemo(() => mergeShelf(weapons.data, customs, ['weapon']), [weapons.data, customs]);
  const entries = useMemo(() => filterEquipment(all, filters), [all, filters]);
  return (
    <LibraryShelf
      {...shared(shelf)}
      what="weapons"
      pending={weapons.isPending || shelf.customsPending}
      error={weapons.error ?? shelf.customsError}
      onRetry={() => {
        void weapons.refetch();
        shelf.onRetryCustoms();
      }}
      total={all.length}
      entries={entries}
      meta={w => `${w.category} ${w.kind}${fromText(w.custom, list)}`}
      templates={<TemplateButton kind="weapon" onEditor={shelf.onEditor} />}
      detail={w => (
        <WithPanels kind="weapon" custom={w.custom} srd={list}>
          <WeaponDetail weapon={w} controls={controlsFor('weapon', w, list, shelf)} />
        </WithPanels>
      )}
      extraFilters={
        <CategoryFilter
          filters={filters}
          onFilters={onFilters}
          options={[
            ['simple', 'Simple'],
            ['martial', 'Martial'],
          ]}
        />
      }
    />
  );
}

/** Items hold armour and shields, and the DM's own items; the SRD's other gear and magic items come later. */
function ItemShelf(shelf: ShelfProps) {
  const { filters, onFilters, customs } = shelf;
  const armor = useSrdArmor();
  const list: SrdArmor[] = armor.data ?? [];
  const all = useMemo(() => mergeShelf(armor.data, customs, ['armor', 'item']), [armor.data, customs]);
  const entries = useMemo(() => filterEquipment(all, filters), [all, filters]);
  const metaOf = (a: WithCustom<SrdArmor>) => {
    if (a.custom?.kind === 'item') return String(a.custom.definition.itemKind);
    return `${a.category === 'shield' ? 'shield' : `${a.category} armour`}${fromText(a.custom, list)}`;
  };
  return (
    <LibraryShelf
      {...shared(shelf)}
      what="items"
      pending={armor.isPending || shelf.customsPending}
      error={armor.error ?? shelf.customsError}
      onRetry={() => {
        void armor.refetch();
        shelf.onRetryCustoms();
      }}
      total={all.length}
      entries={entries}
      meta={metaOf}
      templates={
        <>
          <TemplateButton kind="armor" onEditor={shelf.onEditor} />
          <TemplateButton kind="item" onEditor={shelf.onEditor} />
        </>
      }
      detail={a =>
        a.custom?.kind === 'item' ? (
          <WithPanels kind="item" custom={a.custom} srd={list}>
            <CustomItemDetail custom={a.custom} controls={controlsFor('item', a, list, shelf)} />
          </WithPanels>
        ) : (
          <WithPanels kind="armor" custom={a.custom} srd={list}>
            <ArmorDetail armor={a} controls={controlsFor('armor', a, list, shelf)} />
          </WithPanels>
        )
      }
      extraFilters={
        <CategoryFilter
          filters={filters}
          onFilters={onFilters}
          options={[
            ['light', 'Light armour'],
            ['medium', 'Medium armour'],
            ['heavy', 'Heavy armour'],
            ['shield', 'Shield'],
          ]}
        />
      }
    />
  );
}

const startingFilters = () => Object.fromEntries(TABS.map(t => [t.id, NO_FILTERS])) as Record<TabId, LibraryFilters>;

function Shelves({
  campaignId,
  tab,
  shelf,
}: {
  campaignId: string;
  tab: TabId;
  shelf: Omit<ShelfProps, 'campaignId' | 'customs' | 'customsPending' | 'customsError' | 'onRetryCustoms'>;
}) {
  const customs = useCustomContent(campaignId);
  const props: ShelfProps = {
    ...shelf,
    campaignId,
    customs: customs.data ?? [],
    customsPending: customs.isPending,
    customsError: customs.error,
    onRetryCustoms: () => void customs.refetch(),
  };
  if (tab === 'spells') return <SpellShelf {...props} />;
  if (tab === 'monsters') return <MonsterShelf {...props} />;
  if (tab === 'weapons') return <WeaponShelf {...props} />;
  return <ItemShelf {...props} />;
}

export default function LibraryPage() {
  const { campaignId } = useParams();
  const campaign = useCampaign(campaignId);
  const { dmMode, roleLoading } = useDmMode(campaignId);
  useShowDmIndicator(dmMode);
  const [tab, setTab] = useState<TabId>('spells');
  const [filters, setFilters] = useState(startingFilters);
  const [selected, setSelected] = useState<Partial<Record<TabId, string>>>({});
  const [editing, setEditing] = useState<EditorRequest | null>(null);

  if (!campaignId) return <Navigate to="/campaigns" replace />;
  if (roleLoading) {
    return (
      <p role="status" className="auth-status">
        Unlocking the library…
      </p>
    );
  }
  // players never see the library, and a DM previewing the player view sees what a player sees
  if (!dmMode) return <Navigate to={`/campaigns/${campaignId}`} replace />;

  const reading = !!selected[tab] && !editing;
  const headerClass = reading ? styles.phoneHidden : undefined;
  const tabLabel = TABS.find(t => t.id === tab)?.label ?? '';

  return (
    <PageGrid className={styles.page}>
      <Cell className={headerClass}>
        <IconLink to={`/campaigns/${campaignId}`} end icon={ArrowLeft} className={styles.back}>
          Back to the chronicle
        </IconLink>
      </Cell>
      <Cell className={headerClass}>
        <SectionTitle as="h1" onDesk>
          The Library
        </SectionTitle>
      </Cell>
      <Cell className={headerClass}>
        <Band items={[campaign.data?.name, 'SRD 5.2.1', 'DM mode']} />
      </Cell>
      <Cell className={headerClass}>
        <RibbonTabs
          aria-label="Library shelves"
          tabs={[...TABS]}
          value={tab}
          onChange={id => {
            setEditing(null);
            setTab(id as TabId);
          }}
        />
      </Cell>
      <Cell role="tabpanel" aria-label={tabLabel} className={styles.shelves}>
        {editing ? (
          <CustomEditor
            key={editing.entry?.id ?? editing.parent?.id ?? editing.kind}
            campaignId={campaignId}
            request={editing}
            onClose={() => setEditing(null)}
            onSaved={entry => {
              setSelected(all => ({ ...all, [TAB_OF_KIND[entry.kind]]: entry.id }));
              setEditing(null);
            }}
          />
        ) : (
          <Shelves
            key={tab}
            campaignId={campaignId}
            tab={tab}
            shelf={{
              filters: filters[tab],
              onFilters: next => setFilters(all => ({ ...all, [tab]: next })),
              selectedId: selected[tab] ?? null,
              onSelect: id => setSelected(all => ({ ...all, [tab]: id ?? undefined })),
              onEditor: setEditing,
            }}
          />
        )}
      </Cell>
    </PageGrid>
  );
}
