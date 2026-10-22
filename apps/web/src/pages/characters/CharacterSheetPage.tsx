// P1-7: the read-only Sheet tab. Every number comes from computeSheet in the rules engine; this page only lays
// them out. Tapping a save, skill or attack opens the odds popup, which shows the server's own preview of the roll
// (P2-2) and rolls through the roll Edge Function: the bonus is never sent from here.
import { computeSheet, hillGiantStrength, type ComputedRoll } from '@dnd-manager/rules-engine';
import { Backpack, BookOpen, ChevronRight, Dices, ScrollText, Swords, UserRound } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ErrorNotice } from '../../components/ErrorNotice';
import { OddsPopup, type OddsCheck } from '../../components/odds/OddsPopup';
import { ICON_PROPS, IconLink, Input, Paper, RibbonTabs, Tag, Toggle } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
import { rollForCharacter, type CharacterRollRequest } from '../../data/rolls';
import { useCampaign } from '../../hooks/useCampaigns';
import {
  useAddEffect,
  useCharacter,
  useCharacterEffects,
  useEffectSecrets,
  useRemoveEffect,
  useRollPreview,
} from '../../hooks/useCharacters';
import { useDmMode } from '../../hooks/useDmMode';
import { useMembers } from '../../hooks/useMembers';
import { durationText, timeLeft } from '../../lib/gameClock';
import { useShowDmIndicator } from '../../state/dmIndicator';
import styles from './CharacterSheetPage.module.css';

const TABS = [
  { id: 'sheet', label: 'Sheet', icon: ScrollText },
  { id: 'details', label: 'Details', icon: UserRound, disabled: true, title: 'Coming soon' },
  { id: 'spells', label: 'Spells', icon: BookOpen, disabled: true, title: 'Coming soon' },
  { id: 'pack', label: 'Pack', icon: Backpack, disabled: true, title: 'Coming soon' },
];
const POTION = 'Potion of Hill Giant Strength';
const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);
const thousands = (n: number) => n.toLocaleString('en');

export function CharacterSheetPage() {
  const id = useId();
  const { campaignId = '', characterId = '' } = useParams();
  const campaign = useCampaign(campaignId);
  const { isDm, dmMode, setDmMode } = useDmMode(campaignId);
  useShowDmIndicator(dmMode);
  const character = useCharacter(characterId);
  const effects = useCharacterEffects(characterId);
  const effectIds = useMemo(() => (effects.data ?? []).map(e => e.id), [effects.data]);
  const secrets = useEffectSecrets(characterId, effectIds, dmMode);
  const members = useMembers(campaignId);
  const gameSeconds = campaign.data?.gameSeconds ?? 0;
  const clock = useMemo(() => ({ seconds: gameSeconds }), [gameSeconds]);
  const [dc, setDc] = useState('');
  const [ac, setAc] = useState('');
  const [odds, setOdds] = useState<{ request: CharacterRollRequest; check: OddsCheck; anchor: HTMLElement } | null>(
    null,
  );

  const sheet = useMemo(
    () => (character.data ? computeSheet(character.data.sheet, effects.data ?? [], clock) : null),
    [character.data, effects.data, clock],
  );

  const campaignName = campaign.data?.name ?? 'Campaign';
  const crumb = (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <IconLink to={`/campaigns/${campaignId}/characters`} icon={Swords}>
        {campaignName}
      </IconLink>
      <ChevronRight {...ICON_PROPS} className={styles.crumbSep} />
      <span aria-current="page">{character.data?.name ?? 'Character'}</span>
    </nav>
  );

  if (character.isPending) {
    return (
      <main className={styles.page}>
        {crumb}
        <p role="status" className={styles.status}>
          Unfolding the sheet…
        </p>
      </main>
    );
  }
  if (character.isError || !sheet) {
    return (
      <main className={styles.page}>
        {crumb}
        <ErrorNotice error={character.error} onRetry={() => character.refetch()} />
      </main>
    );
  }

  const data = character.data;
  const owner = members.data?.find(m => m.userId === data.ownerId);
  // the DM's target number: empty means "ask your DM", and the popup then uses a common middle value
  const dcValue = Number(dc) || 15;
  const acValue = Number(ac) || 13;

  function open(
    anchor: HTMLElement,
    label: string,
    kind: OddsCheck['kind'],
    skill: string,
    key: string,
    roll: ComputedRoll,
  ) {
    const target = kind === 'attack' ? acValue : dcValue;
    setOdds({
      anchor,
      request: { campaignId, characterId, kind, key, target },
      // shown until the server's preview arrives, which then replaces the bonus, mode and odds
      check: {
        label,
        kind,
        skill,
        bonus: roll.bonus,
        bonusBreakdown: roll.breakdown,
        target,
      },
    });
  }

  const lockedWeapons = sheet.attacks.filter(a => !a.usable);
  const potion = effects.data?.find(e => e.name === POTION);

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        {crumb}
        {owner && <span className={styles.player}>{`Played by ${owner.displayName}`}</span>}
        {isDm && <Toggle checked={dmMode} onChange={setDmMode} label="DM mode" />}
      </div>
      <RibbonTabs aria-label="Character sections" tabs={TABS} value="sheet" onChange={() => {}} />

      <Paper as="section" texture="full" role="tabpanel" aria-label="Sheet" className={styles.sheet}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.name}>{data.name}</h1>
            <p className={styles.muted}>{data.sheet.species}</p>
          </div>
          <Box label="Class and level">{`${data.sheet.className} ${sheet.level}`}</Box>
          <Box label="Background">{data.sheet.background}</Box>
          <Box label="Alignment">{data.sheet.alignment}</Box>
        </header>

        <div className={styles.box}>
          <div className={styles.boxHead}>
            <span className={styles.label}>Experience</span>
            <span className={styles.muted}>
              {sheet.xp.nextLevelAt === null
                ? `${thousands(sheet.xp.total)}: the highest level`
                : `${thousands(sheet.xp.total)} of ${thousands(sheet.xp.nextLevelAt)} for Level ${sheet.xp.level + 1}`}
            </span>
          </div>
          {sheet.xp.pending > 0 && (
            <div className={styles.levelUp}>
              <Tag>{`Level up available: ${sheet.xp.pending} ${sheet.xp.pending === 1 ? 'level' : 'levels'} (level ${sheet.xp.level} by XP)`}</Tag>
              {/* the level-up flow is P2-10; until then the button is a placeholder */}
              <button type="button" disabled aria-describedby="level-up-soon" className={styles.levelUpButton}>
                Level up
              </button>
              <span id="level-up-soon" className={styles.small}>
                Levelling up arrives in a later update. The sheet stays at level {sheet.level} until then.
              </span>
            </div>
          )}
          <Bar label="Experience" value={sheet.xp.intoLevel} max={sheet.xp.intoLevel + sheet.xp.toNext} />
        </div>

        <div className={styles.columns}>
          <section aria-label="Ability scores" className={styles.abilities}>
            {Object.values(sheet.abilities).map(a => (
              <div key={a.ability} className={styles.ability}>
                <span className={styles.label}>{a.label}</span>
                <b className={a.score !== a.base ? styles.boosted : ''}>{a.score}</b>
                <span>{signed(a.modifier)}</span>
                {a.applied.length > 0 && <span className={styles.small}>{`${a.applied[0].name}`}</span>}
              </div>
            ))}
          </section>

          <div className={styles.column}>
            <div className={styles.targets}>
              <span>
                <label htmlFor={`${id}-dc`}>DC</label>
                <Input
                  id={`${id}-dc`}
                  type="number"
                  inputMode="numeric"
                  placeholder="Ask your DM"
                  value={dc}
                  onChange={e => setDc(e.target.value)}
                />
              </span>
              <span>
                <label htmlFor={`${id}-ac`}>Target armour class</label>
                <Input
                  id={`${id}-ac`}
                  type="number"
                  inputMode="numeric"
                  placeholder="Ask your DM"
                  value={ac}
                  onChange={e => setAc(e.target.value)}
                />
              </span>
            </div>
            <RollList
              title="Saving throws"
              rows={sheet.saves.map(s => ({ key: s.ability, label: s.label, roll: s, marks: s.proficient ? 1 : 0 }))}
              onPick={(anchor, row) => open(anchor, `${row.label} saving throw`, 'save', row.label, row.key, row.roll)}
            />
            <RollList
              title="Skills"
              hint="tap to roll"
              rows={sheet.skills.map(s => ({
                key: s.key,
                label: s.label,
                roll: s,
                marks: s.expertise ? 2 : s.proficient ? 1 : 0,
              }))}
              onPick={(anchor, row) => open(anchor, `${row.label} check`, 'check', row.label, row.key, row.roll)}
            />
          </div>

          <div className={styles.column}>
            <div className={styles.stats}>
              <Stat label="Armour" value={String(sheet.armorClass.value)} />
              <Stat label="Initiative" value={signed(sheet.initiative.bonus)} />
              <Stat label="Speed" value={String(sheet.speed.value)} />
              <Stat label="Proficiency" value={signed(sheet.proficiencyBonus)} />
            </div>
            <p className={styles.muted}>{`Passive Perception ${sheet.passivePerception}`}</p>

            <div className={styles.box}>
              <div className={styles.boxHead}>
                <span className={styles.label}>Hit points</span>
                <span>
                  {`${sheet.hp.current} of ${sheet.hp.max}${sheet.hp.temp ? ` (+${sheet.hp.temp} temporary)` : ''} · Hit dice ${sheet.hitDice.remaining}${sheet.hitDice.die}`}
                </span>
              </div>
              <Bar label="Hit points" value={sheet.hp.current} max={sheet.hp.max} />
            </div>

            <section aria-labelledby={`${id}-attacks`} className={styles.box}>
              <h2 id={`${id}-attacks`} className={styles.label}>
                Attacks
              </h2>
              <ul className={styles.list}>
                {sheet.attacks
                  .filter(a => a.usable)
                  .map(a => (
                    <li key={a.id}>
                      <button
                        type="button"
                        className={styles.attack}
                        onClick={e => open(e.currentTarget, a.name, 'attack', a.name, a.id, a)}
                      >
                        <span>
                          {a.name}
                          {a.mastery && <span className={styles.muted}>{` · ${a.mastery}`}</span>}
                          {a.unlockedBy && (
                            <span className={styles.small}>
                              {`usable for ${a.unlockedBy.expiresAtSeconds ? timeLeft(a.unlockedBy.expiresAtSeconds, clock) : 'now'} (${a.unlockedBy.name})`}
                            </span>
                          )}
                        </span>
                        <b className={styles.big}>{signed(a.bonus)}</b>
                        <span>{`${a.damage} ${a.damageType}`}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>

            <section aria-labelledby={`${id}-effects`} className={styles.box}>
              <h2 id={`${id}-effects`} className={styles.label}>
                Active effects
              </h2>
              {sheet.activeEffects.length === 0 ? (
                <p className={styles.muted}>None</p>
              ) : (
                <ul className={styles.chips}>
                  {sheet.activeEffects.map(e => (
                    <li key={e.id}>
                      <Tag>{`${e.name} · ${durationText(e, clock)}`}</Tag>
                      {dmMode && secrets.data?.get(e.id) && (
                        <span className={styles.secret}>{`DM only: ${secrets.data.get(e.id)}`}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {import.meta.env.DEV && dmMode && (
                <PotionToggle characterId={characterId} potionId={potion?.id} clock={clock.seconds} />
              )}
            </section>

            <section aria-labelledby={`${id}-equipment`} className={styles.box}>
              <h2 id={`${id}-equipment`} className={styles.label}>
                Equipment
              </h2>
              <ul className={styles.list}>
                {data.sheet.equipment.map(item => (
                  <li key={item}>{item}</li>
                ))}
                {sheet.attacks
                  .filter(a => !a.usable || a.unlockedBy)
                  .map(a => (
                    <li key={`gear-${a.id}`}>
                      {a.name}
                      <span className={styles.small}>
                        {a.unlockedBy
                          ? `Usable for ${a.unlockedBy.expiresAtSeconds ? timeLeft(a.unlockedBy.expiresAtSeconds, clock) : 'now'}, thanks to ${a.unlockedBy.name}`
                          : a.lockReasons.join('; ')}
                      </span>
                    </li>
                  ))}
              </ul>
              {lockedWeapons.length > 0 && (
                <p className={styles.muted}>Locked items cannot be used until the need is met.</p>
              )}
            </section>
          </div>
        </div>
      </Paper>

      {odds && <ServerOdds {...odds} onClose={() => setOdds(null)} />}
    </main>
  );
}

/** The odds popup for a character's roll: the server's preview, then the server's roll. */
function ServerOdds({
  request,
  check,
  anchor,
  onClose,
}: {
  request: CharacterRollRequest;
  check: OddsCheck;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const preview = useRollPreview(request);
  const p = preview.data;
  const shown: OddsCheck = p
    ? {
        ...check,
        bonus: p.bonus,
        bonusBreakdown: p.bonusBreakdown,
        server: { mode: p.mode, reasons: p.reasons, chance: p.chance, critChance: p.critChance },
      }
    : check;
  return (
    <OddsPopup
      open
      check={shown}
      anchor={anchor}
      onClose={onClose}
      waiting={preview.isPending ? 'Asking the server for the odds…' : undefined}
      problem={preview.isError ? friendlyMessage(preview.error) : (p?.autoFail ?? undefined)}
      onRoll={() => rollForCharacter(request)}
    />
  );
}

function Box({ label, children }: { label: string; children: string }) {
  return (
    <div className={styles.box}>
      <span className={styles.label}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.label}>{label}</span>
      <b className={styles.big}>{value}</b>
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={styles.bar}
    >
      <div className={styles.fill} style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

interface RollRowData {
  key: string;
  label: string;
  roll: ComputedRoll;
  /** 0 none, 1 proficient, 2 expertise. */
  marks: number;
}

function RollList({
  title,
  hint,
  rows,
  onPick,
}: {
  title: string;
  hint?: string;
  rows: RollRowData[];
  onPick: (anchor: HTMLElement, row: RollRowData) => void;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={styles.box}>
      <h2 id={id} className={styles.label}>
        {title} {hint && <span className={styles.muted}>{hint}</span>}
      </h2>
      <ul className={styles.list}>
        {rows.map(row => (
          <li key={row.key}>
            <button
              type="button"
              className={styles.rollRow}
              aria-label={`${row.label} ${signed(row.roll.bonus)}${row.marks === 2 ? ', expertise' : row.marks ? ', proficient' : ''}: see the odds`}
              onClick={e => onPick(e.currentTarget, row)}
            >
              <span
                className={`${styles.dot} ${row.marks ? styles.dotOn : ''} ${row.marks === 2 ? styles.dotDouble : ''}`}
              />
              <i>{signed(row.roll.bonus)}</i>
              {row.label}
              <Dices {...ICON_PROPS} className={styles.rollIcon} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Development only: give or take away the Potion of Hill Giant Strength, to see the sheet change. */
function PotionToggle({ characterId, potionId, clock }: { characterId: string; potionId?: string; clock: number }) {
  const add = useAddEffect(characterId);
  const remove = useRemoveEffect(characterId);
  const error = add.error ?? remove.error;
  return (
    <div className={styles.dev}>
      <Toggle
        checked={!!potionId}
        disabled={add.isPending || remove.isPending}
        onChange={on => {
          // the database gives the effect its own id
          if (on) add.mutate(hillGiantStrength(clock));
          else if (potionId) remove.mutate(potionId);
        }}
        label={`Dev: ${POTION} (1 hour)`}
      />
      {error && (
        <p role="alert" className={styles.error}>
          {friendlyMessage(error)}
        </p>
      )}
    </div>
  );
}
