// P3-5: /campaigns/:campaignId/library, the DM's shelves of SRD spells, monsters, weapons and armour.
import { spellTier, spellTierGap, TIERS_OF_PLAY, type TierClass, type TierOfPlay } from '@dnd-manager/rules-engine';
import type { SrdSpell } from '@dnd-manager/srd-data/schemas';
import { ArrowLeft, Shield, Skull, Sparkles, Swords } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Band, Cell, IconLink, PageGrid, RibbonTabs, SectionTitle } from '../../components/ui';
import { useCampaign } from '../../hooks/useCampaigns';
import { useDmMode } from '../../hooks/useDmMode';
import { useSrdArmor, useSrdClasses, useSrdMonsters, useSrdSpells, useSrdWeapons } from '../../hooks/useLibrary';
import { useShowDmIndicator } from '../../state/dmIndicator';
import { ArmorDetail, MonsterDetail, SpellDetail, WeaponDetail } from './EntryDetails';
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

const NO_CLASSES: readonly TierClass[] = [];

interface ShelfProps {
  filters: LibraryFilters;
  onFilters: (filters: LibraryFilters) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function spellMeta(s: SrdSpell, classes: readonly TierClass[]) {
  const tier = spellTier(s, classes);
  return `${s.level === 0 ? 'Cantrip' : `L${s.level}`} · ${tier === 'unknown' ? 'tier unknown' : `tier ${tier}`}`;
}

function SpellShelf({ filters, onFilters, ...selection }: ShelfProps) {
  const id = useId();
  const spells = useSrdSpells();
  const classes = useSrdClasses();
  const allSpells = spells.data;
  const allClasses = classes.data ?? NO_CLASSES;
  const entries = useMemo(() => filterSpells(allSpells ?? [], allClasses, filters), [allSpells, allClasses, filters]);
  const classNames = useMemo(() => [...new Set(allSpells?.flatMap(s => s.classes))].sort(), [allSpells]);

  useEffect(() => {
    if (!allSpells || !classes.data) return;
    const gaps = allSpells.flatMap(s => spellTierGap(s, classes.data) ?? []);
    if (gaps.length > 0) console.warn(`Tier of play unknown for ${gaps.length} spells: ${gaps.join('; ')}`);
  }, [allSpells, classes.data]);

  const toggleTier = (tier: TierOfPlay, on: boolean) =>
    onFilters({ ...filters, tiers: on ? [...filters.tiers, tier] : filters.tiers.filter(t => t !== tier) });

  return (
    <LibraryShelf
      what="spells"
      pending={spells.isPending || classes.isPending}
      error={spells.error ?? classes.error}
      onRetry={() => {
        void spells.refetch();
        void classes.refetch();
      }}
      total={allSpells?.length ?? 0}
      entries={entries}
      meta={s => spellMeta(s, allClasses)}
      filters={filters}
      onFilters={onFilters}
      detail={s => <SpellDetail spell={s} classes={allClasses} />}
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
      {...selection}
    />
  );
}

function MonsterShelf({ campaignId, filters, onFilters, ...selection }: ShelfProps & { campaignId: string }) {
  const id = useId();
  const monsters = useSrdMonsters();
  const all = monsters.data;
  const entries = useMemo(() => filterMonsters(all ?? [], filters), [all, filters]);
  const ratings = useMemo(() => challengeRatings(all ?? []), [all]);
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
      what="monsters"
      pending={monsters.isPending}
      error={monsters.error}
      onRetry={() => void monsters.refetch()}
      total={all?.length ?? 0}
      entries={entries}
      meta={m => `CR ${m.challengeRating}`}
      filters={filters}
      onFilters={onFilters}
      detail={m => <MonsterDetail campaignId={campaignId} monster={m} />}
      extraFilters={
        <div className={styles.crRange}>
          {crPicker('crMin', 'Lowest challenge', 'Any')}
          {crPicker('crMax', 'Highest challenge', 'Any')}
        </div>
      }
      {...selection}
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

function WeaponShelf({ filters, onFilters, ...selection }: ShelfProps) {
  const weapons = useSrdWeapons();
  const entries = useMemo(() => filterEquipment(weapons.data ?? [], filters), [weapons.data, filters]);
  return (
    <LibraryShelf
      what="weapons"
      pending={weapons.isPending}
      error={weapons.error}
      onRetry={() => void weapons.refetch()}
      total={weapons.data?.length ?? 0}
      entries={entries}
      meta={w => `${w.category} ${w.kind}`}
      filters={filters}
      onFilters={onFilters}
      detail={w => <WeaponDetail weapon={w} />}
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
      {...selection}
    />
  );
}

/** Items hold armour and shields for now; the SRD's other gear and magic items come later. */
function ItemShelf({ filters, onFilters, ...selection }: ShelfProps) {
  const armor = useSrdArmor();
  const entries = useMemo(() => filterEquipment(armor.data ?? [], filters), [armor.data, filters]);
  return (
    <LibraryShelf
      what="items"
      pending={armor.isPending}
      error={armor.error}
      onRetry={() => void armor.refetch()}
      total={armor.data?.length ?? 0}
      entries={entries}
      meta={a => (a.category === 'shield' ? 'shield' : `${a.category} armour`)}
      filters={filters}
      onFilters={onFilters}
      detail={a => <ArmorDetail armor={a} />}
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
      {...selection}
    />
  );
}

const startingFilters = () => Object.fromEntries(TABS.map(t => [t.id, NO_FILTERS])) as Record<TabId, LibraryFilters>;

export default function LibraryPage() {
  const { campaignId } = useParams();
  const campaign = useCampaign(campaignId);
  const { dmMode, roleLoading } = useDmMode(campaignId);
  useShowDmIndicator(dmMode);
  const [tab, setTab] = useState<TabId>('spells');
  const [filters, setFilters] = useState(startingFilters);
  const [selected, setSelected] = useState<Partial<Record<TabId, string>>>({});

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

  const reading = !!selected[tab];
  const headerClass = reading ? styles.phoneHidden : undefined;
  const shelf: ShelfProps = {
    filters: filters[tab],
    onFilters: next => setFilters(all => ({ ...all, [tab]: next })),
    selectedId: selected[tab] ?? null,
    onSelect: id => setSelected(all => ({ ...all, [tab]: id ?? undefined })),
  };
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
        <RibbonTabs aria-label="Library shelves" tabs={[...TABS]} value={tab} onChange={id => setTab(id as TabId)} />
      </Cell>
      <Cell role="tabpanel" aria-label={tabLabel} className={styles.shelves}>
        {tab === 'spells' && <SpellShelf {...shelf} />}
        {tab === 'monsters' && <MonsterShelf campaignId={campaignId} {...shelf} />}
        {tab === 'weapons' && <WeaponShelf {...shelf} />}
        {tab === 'items' && <ItemShelf {...shelf} />}
      </Cell>
    </PageGrid>
  );
}
