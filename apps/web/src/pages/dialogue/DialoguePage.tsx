// P4-6: the DM's dialogue tool for one NPC (the mockup's left page), with what the players see beside it. The DM picks
// who is listening (one or more party groups), says prepared lines (each marked eligible when its condition suits the
// first listening group) or something new, offers checks, and watches the answers and the players' choices arrive.
import { evaluateCondition, describeCondition, type DialogueContext, type RollMode } from '@dnd-manager/rules-engine';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { SpeechScroll } from '../../components/dialogue/SpeechScroll';
import { checkName, DISPOSITION_WORDS } from '../../components/dialogue/checkWords';
import { ErrorNotice } from '../../components/ErrorNotice';
import { LoadingRunes } from '../../components/LoadingRunes';
import { Button, Cell, ICON_PROPS, iconClasses, IconLink, PageGrid, Paper } from '../../components/ui';
import {
  DISPOSITIONS,
  LINE_MAX,
  type CheckRequest,
  type DialogueLine,
  type DialogueOption,
  type Disposition,
  type LineDraft,
  type ShownOption,
} from '../../data/dialogue';
import { friendlyMessage } from '../../data/errors';
import { useCharacters } from '../../hooks/useCharacters';
import {
  useCheckRequests,
  useCloseCheck,
  useDeleteLine,
  useDialogueChoices,
  useDialogueLog,
  useLines,
  useNpcProfile,
  useOfferCheck,
  useSaveLine,
  useSayLine,
  useSetDisposition,
} from '../../hooks/useDialogue';
import { useDmMode } from '../../hooks/useDmMode';
import { useEntities } from '../../hooks/useEntities';
import { usePartyGroups } from '../../hooks/useHere';
import { useItems } from '../../hooks/useItems';
import { useMembers } from '../../hooks/useMembers';
import { useCampaignRegions } from '../../hooks/useRegions';
import { useShowDmIndicator } from '../../state/dmIndicator';
import { ConditionEditor, OptionsEditor, SkillSelect } from './editors';
import styles from './dialogue.module.css';

/** What a DM-written option looks like to players (the preview shows the DC only if the DM shows the odds). */
const shown = (o: DialogueOption): ShownOption =>
  o.kind === 'check' && o.check
    ? {
        label: o.label,
        kind: 'check',
        check: { skill: o.check.skill, showOdds: o.check.showOdds, ...(o.check.showOdds ? { dc: o.check.dc } : {}) },
      }
    : { label: o.label, kind: o.kind };

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export default function DialoguePage() {
  const { campaignId = '', npcId = '' } = useParams();
  const { isDm, dmMode, roleLoading } = useDmMode(campaignId);
  useShowDmIndicator(dmMode);
  if (roleLoading) return <LoadingRunes>Finding the NPC…</LoadingRunes>;
  if (!isDm || !dmMode) return <Navigate to={`/campaigns/${campaignId}/entities`} replace />;
  return <DialogueTool campaignId={campaignId} npcId={npcId} />;
}

function DialogueTool({ campaignId, npcId }: { campaignId: string; npcId: string }) {
  const entities = useEntities(campaignId, true);
  const npc = entities.data?.find(e => e.id === npcId && e.type === 'npc');
  const profile = useNpcProfile(npcId);
  const setDisposition = useSetDisposition(campaignId, npcId);
  const groups = usePartyGroups(campaignId, true);
  const characters = useCharacters(campaignId);
  const items = useItems(campaignId);
  const regions = useCampaignRegions(campaignId);
  const members = useMembers(campaignId);
  const lines = useLines(npcId);
  const say = useSayLine(campaignId, npcId);
  const log = useDialogueLog(campaignId, npcId);
  const requests = useCheckRequests(campaignId);
  const choices = useDialogueChoices();
  const [listening, setListening] = useState<string[] | null>(null);
  const [saveToLog, setSaveToLog] = useState(true);
  const [said, setSaid] = useState<ReadonlySet<string>>(new Set());
  const [lastSaid, setLastSaid] = useState<{ text: string; options: ShownOption[] } | null>(null);
  const [editing, setEditing] = useState<DialogueLine | 'new' | null>(null);

  const groupList = groups.data ?? [];
  // until the DM chooses, the first group listens
  const heard = listening ?? (groupList[0] ? [groupList[0].id] : []);
  const charList = characters.data ?? [];
  const nameOfChar = (id: string) => charList.find(c => c.id === id)?.name ?? 'A character';

  // what the first listening group brings with it, for the "eligible" tag
  const context = ((): DialogueContext | null => {
    const group = groupList.find(g => g.id === heard[0]);
    if (!group) return null;
    const ids = group.characterIds;
    return {
      characterIds: ids,
      itemNames: (items.data ?? [])
        .filter(i => i.ownerType === 'character' && ids.includes(i.ownerId ?? ''))
        .map(i => i.name),
      regionId: group.regionId,
      levels: charList.filter(c => ids.includes(c.id)).map(c => c.levelApplied),
    };
  })();

  if (entities.isError) return <ErrorNotice error={entities.error} onRetry={() => entities.refetch()} />;
  if (!entities.data) return <LoadingRunes>Finding the NPC…</LoadingRunes>;
  if (!npc) return <Navigate to={`/campaigns/${campaignId}/entities`} replace />;

  const disposition: Disposition = profile.data?.disposition ?? 'indifferent';
  const groupName = (id: string) => groupList.find(g => g.id === id)?.name ?? 'A group';
  const regionName = (id: string) => regions.data?.find(r => r.id === id)?.name;
  const firstListener = groupList.find(g => g.id === heard[0]);
  const viewerName = firstListener?.characterIds[0] ? nameOfChar(firstListener.characterIds[0]) : 'the players';

  function sayIt(text: string, options: DialogueOption[], extra: { saveToNpc?: boolean; lineId?: string } = {}) {
    say.mutate(
      { text, options, groupIds: heard, saveToNpc: extra.saveToNpc ?? false, saveToLog },
      {
        onSuccess: () => {
          if (extra.lineId) setSaid(s => new Set(s).add(extra.lineId!));
          setLastSaid({ text: text.trim(), options: options.map(shown) });
        },
      },
    );
  }

  return (
    <PageGrid className={styles.page}>
      <Cell>
        <div className={styles.top}>
          <IconLink to={`/campaigns/${campaignId}/entities`} icon={ArrowLeft}>
            Codex
          </IconLink>
        </div>
      </Cell>

      <Cell span={7} spanMd={6}>
        <Paper as="section" texture="full" aria-label={`Dialogue with ${npc.name}`} className={styles.work}>
          <header className={styles.header}>
            <h1 className={styles.name}>{npc.name}</h1>
            <label className={styles.field}>
              <span className={styles.label}>Disposition</span>
              <select
                className={styles.select}
                value={disposition}
                disabled={setDisposition.isPending}
                onChange={e => setDisposition.mutate(e.target.value as Disposition)}
              >
                {DISPOSITIONS.map(d => (
                  <option key={d} value={d}>
                    {DISPOSITION_WORDS[d]}
                  </option>
                ))}
              </select>
            </label>
          </header>

          <fieldset className={styles.choices}>
            <legend className={styles.sectionTitle}>Who is listening</legend>
            {groupList.length === 0 && <p className={styles.muted}>Make a party group first (on the map’s table).</p>}
            {groupList.map(g => (
              <label key={g.id} className={styles.choice}>
                <input
                  type="checkbox"
                  checked={heard.includes(g.id)}
                  onChange={e => setListening(e.target.checked ? [...heard, g.id] : heard.filter(id => id !== g.id))}
                />
                {g.name}
              </label>
            ))}
          </fieldset>
          <label className={styles.choice}>
            <input type="checkbox" checked={saveToLog} onChange={e => setSaveToLog(e.target.checked)} />
            Save what is said to the session log
          </label>
          {say.isError && (
            <p role="alert" className={styles.alert}>
              {friendlyMessage(say.error)}
            </p>
          )}

          <section className={styles.section} aria-labelledby="prepared">
            <h2 id="prepared" className={styles.sectionTitle}>
              Prepared lines
            </h2>
            {lines.isError && <ErrorNotice error={lines.error} onRetry={() => lines.refetch()} />}
            {lines.data?.length === 0 && <p className={styles.muted}>No prepared lines yet.</p>}
            <ul className={styles.lines}>
              {(lines.data ?? []).map(line =>
                editing !== 'new' && editing?.id === line.id ? (
                  <li key={line.id}>
                    <LineEditor
                      campaignId={campaignId}
                      npcId={npcId}
                      line={line}
                      regions={regions.data ?? []}
                      characters={charList}
                      onDone={() => setEditing(null)}
                    />
                  </li>
                ) : (
                  <LineRow
                    key={line.id}
                    npcId={npcId}
                    line={line}
                    eligible={context ? evaluateCondition(line.condition, context) : false}
                    conditionText={describeCondition(line.condition, { region: regionName, character: nameOfChar })}
                    said={said.has(line.id)}
                    busy={say.isPending || heard.length === 0}
                    onSay={() => sayIt(line.text, line.options, { lineId: line.id })}
                    onEdit={() => setEditing(line)}
                  />
                ),
              )}
            </ul>
            {editing === 'new' ? (
              <LineEditor
                campaignId={campaignId}
                npcId={npcId}
                line={null}
                regions={regions.data ?? []}
                characters={charList}
                onDone={() => setEditing(null)}
              />
            ) : (
              <div>
                <Button variant="ghost" className={iconClasses.host} onClick={() => setEditing('new')}>
                  <Plus {...ICON_PROPS} className={iconClasses.icon} />
                  Prepare a line
                </Button>
              </div>
            )}
          </section>

          <SayNew npcName={npc.name} busy={say.isPending || heard.length === 0} onSay={sayIt} />

          <OfferCheck
            campaignId={campaignId}
            npcId={npcId}
            listening={heard.flatMap(id => groupList.find(g => g.id === id)?.characterIds ?? [])}
            nameOf={nameOfChar}
          />

          <CheckResults campaignId={campaignId} npcId={npcId} requests={requests.data ?? []} nameOf={nameOfChar} />
        </Paper>
      </Cell>

      <Cell span={5} spanMd={6} className={styles.side}>
        <p className={styles.sideLabel}>{`What ${viewerName} sees`}</p>
        {lastSaid ? (
          <SpeechScroll
            line={{ speaker: npc.name, disposition, text: lastSaid.text, options: lastSaid.options }}
            label="What the players see"
          />
        ) : (
          <Paper as="div" texture="flat" className={styles.band}>
            <p className={styles.muted}>Nothing said yet. The line you say appears here as the players see it.</p>
          </Paper>
        )}

        <Paper as="section" texture="flat" aria-label="What the players chose" className={styles.band}>
          <h2 className={styles.sectionTitle}>Their answers</h2>
          {choices.length === 0 ? (
            <p className={styles.muted}>When a player picks an answer, it shows here.</p>
          ) : (
            <ul className={styles.logList}>
              {choices
                .filter(c => c.npcId === npcId)
                .map(c => (
                  <li key={`${c.lineKey}-${c.sender}-${c.at}`}>
                    {`${members.data?.find(m => m.userId === c.sender)?.displayName ?? 'A player'}: “${c.label}”`}{' '}
                    <span className={styles.when}>{time(c.at)}</span>
                  </li>
                ))}
            </ul>
          )}
        </Paper>

        <Paper as="section" texture="flat" aria-label="Session log" className={styles.band}>
          <h2 className={styles.sectionTitle}>Said and logged</h2>
          {(log.data ?? []).length === 0 ? (
            <p className={styles.muted}>Nothing in the log yet.</p>
          ) : (
            <ul className={styles.logList}>
              {(log.data ?? []).map(e => (
                <li key={e.id}>
                  {`“${e.text}”`}{' '}
                  <span
                    className={styles.when}
                  >{`to ${e.groupIds.map(groupName).join(', ')} · ${time(e.saidAt)}`}</span>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.muted}>{`${npc.name} spoke ${(log.data ?? []).length} logged lines.`}</p>
        </Paper>
      </Cell>
    </PageGrid>
  );
}

function LineRow({
  npcId,
  line,
  eligible,
  conditionText,
  said,
  busy,
  onSay,
  onEdit,
}: {
  npcId: string;
  line: DialogueLine;
  eligible: boolean;
  conditionText: string | null;
  said: boolean;
  busy: boolean;
  onSay: () => void;
  onEdit: () => void;
}) {
  const remove = useDeleteLine(npcId);
  return (
    <li className={styles.lineRow}>
      <div className={styles.section}>
        <div className={styles.lineTags}>
          {line.tag && <span className={styles.tag}>{line.tag}</span>}
          {conditionText && <span className={`${styles.tag} ${styles.condition}`}>{conditionText}</span>}
          {eligible && <span className={`${styles.tag} ${styles.eligible}`}>eligible</span>}
        </div>
        <p className={styles.lineText}>{`“${line.text}”`}</p>
        {line.options.length > 0 && (
          <p className={styles.muted}>
            {line.options
              .map(o =>
                o.kind === 'check' && o.check ? `${o.label} (${checkName(o.check.skill)} DC ${o.check.dc})` : o.label,
              )
              .join(' · ')}
          </p>
        )}
      </div>
      <div className={styles.lineButtons}>
        <Button variant={said ? 'ghost' : 'primary'} disabled={busy} onClick={onSay} aria-label={`Say: ${line.text}`}>
          {said ? 'Said' : 'Say'}
        </Button>
        <Button variant="ghost" aria-label="Edit this line" onClick={onEdit}>
          <Pencil {...ICON_PROPS} />
        </Button>
        <Button
          variant="ghost"
          aria-label="Delete this line"
          disabled={remove.isPending}
          onClick={() => remove.mutate(line.id)}
        >
          <Trash2 {...ICON_PROPS} />
        </Button>
      </div>
    </li>
  );
}

function LineEditor({
  campaignId,
  npcId,
  line,
  regions,
  characters,
  onDone,
}: {
  campaignId: string;
  npcId: string;
  line: DialogueLine | null;
  regions: readonly { id: string; name: string }[];
  characters: readonly { id: string; name: string }[];
  onDone: () => void;
}) {
  const id = useId();
  const save = useSaveLine(campaignId, npcId);
  const [draft, setDraft] = useState<LineDraft>({
    text: line?.text ?? '',
    tag: line?.tag ?? '',
    condition: line?.condition ?? null,
    options: line?.options ?? [],
  });
  return (
    <form
      className={styles.editor}
      aria-label={line ? 'Edit the line' : 'A new prepared line'}
      onSubmit={e => {
        e.preventDefault();
        save.mutate({ lineId: line?.id ?? null, draft }, { onSuccess: onDone });
      }}
    >
      <label className={styles.field}>
        <span className={styles.label}>The line</span>
        <textarea
          id={`${id}-text`}
          className={styles.textarea}
          maxLength={LINE_MAX}
          value={draft.text}
          onChange={e => setDraft({ ...draft, text: e.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Tag (e.g. greeting, shop)</span>
        <input
          className={styles.input}
          maxLength={40}
          value={draft.tag}
          onChange={e => setDraft({ ...draft, tag: e.target.value })}
        />
      </label>
      <ConditionEditor
        condition={draft.condition}
        onChange={condition => setDraft({ ...draft, condition })}
        regions={regions}
        characters={characters}
      />
      <OptionsEditor options={draft.options} onChange={options => setDraft({ ...draft, options })} />
      {save.isError && (
        <p role="alert" className={styles.alert}>
          {friendlyMessage(save.error)}
        </p>
      )}
      <div className={styles.row}>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save the line'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SayNew({
  npcName,
  busy,
  onSay,
}: {
  npcName: string;
  busy: boolean;
  onSay: (text: string, options: DialogueOption[], extra: { saveToNpc: boolean }) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [options, setOptions] = useState<DialogueOption[]>([]);
  const [keep, setKeep] = useState(false);
  return (
    <section className={styles.section} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.sectionTitle}>
        Say something new
      </h2>
      <label htmlFor={`${id}-text`} className="visually-hidden">
        {`What ${npcName} says`}
      </label>
      <textarea
        id={`${id}-text`}
        className={styles.textarea}
        maxLength={LINE_MAX}
        value={text}
        placeholder={`What does ${npcName} say?`}
        onChange={e => setText(e.target.value)}
      />
      <OptionsEditor options={options} onChange={setOptions} />
      <div className={`${styles.row} ${styles.spread}`}>
        <label className={styles.choice}>
          <input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} />
          {`Add to ${npcName}’s saved lines`}
        </label>
        <Button
          disabled={busy || !text.trim() || options.some(o => !o.label.trim())}
          onClick={() => {
            onSay(text, options, { saveToNpc: keep });
            setText('');
            setOptions([]);
          }}
        >
          Say it
        </Button>
      </div>
    </section>
  );
}

function OfferCheck({
  campaignId,
  npcId,
  listening,
  nameOf,
}: {
  campaignId: string;
  npcId: string;
  /** The characters in the listening groups. */
  listening: readonly string[];
  nameOf: (id: string) => string;
}) {
  const id = useId();
  const offer = useOfferCheck(campaignId);
  const [key, setKey] = useState('persuasion');
  const [kind, setKind] = useState<'check' | 'save'>('check');
  const [dc, setDc] = useState(13);
  const [mode, setMode] = useState<RollMode>('normal');
  const [reason, setReason] = useState('');
  const [showOdds, setShowOdds] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [who, setWho] = useState<'all' | 'chosen'>('all');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const targets = who === 'all' ? [...listening] : listening.filter(c => chosen.has(c));

  return (
    <form
      className={styles.section}
      aria-labelledby={`${id}-title`}
      onSubmit={e => {
        e.preventDefault();
        setDone(null);
        offer.mutate(
          { characterIds: targets, key, kind, dc, mode, reason, showOdds, prompt, npcId },
          {
            onSuccess: () => {
              setDone(`Offered to ${targets.map(nameOf).join(', ')}.`);
              setPrompt('');
            },
          },
        );
      }}
    >
      <h2 id={`${id}-title`} className={styles.sectionTitle}>
        Offer a check
      </h2>
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Check or save</span>
          <select
            className={styles.select}
            value={kind}
            onChange={e => {
              const k = e.target.value as 'check' | 'save';
              setKind(k);
              if (k === 'save' && !['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(key)) setKey('wis');
            }}
          >
            <option value="check">Check</option>
            <option value="save">Saving throw</option>
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Skill or ability</span>
          <SkillSelect id={`${id}-key`} value={key} onChange={setKey} abilitiesOnly={kind === 'save'} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>DC</span>
          <input
            type="number"
            min={1}
            max={30}
            className={`${styles.input} ${styles.short}`}
            value={dc}
            onChange={e => setDc(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Roll with</span>
          <select className={styles.select} value={mode} onChange={e => setMode(e.target.value as RollMode)}>
            <option value="normal">One d20</option>
            <option value="advantage">Advantage</option>
            <option value="disadvantage">Disadvantage</option>
          </select>
        </label>
        {mode !== 'normal' && (
          <label className={styles.field}>
            <span className={styles.label}>Because</span>
            <input className={styles.input} maxLength={200} value={reason} onChange={e => setReason(e.target.value)} />
          </label>
        )}
      </div>
      <label className={styles.field}>
        <span className={styles.label}>What is it for?</span>
        <input
          className={styles.input}
          maxLength={200}
          value={prompt}
          placeholder="Haggle over the price"
          onChange={e => setPrompt(e.target.value)}
        />
      </label>
      <label className={styles.choice}>
        <input type="checkbox" checked={showOdds} onChange={e => setShowOdds(e.target.checked)} />
        Show players the DC and their odds
      </label>
      <fieldset className={styles.choices}>
        <legend className={styles.label}>Who makes it</legend>
        <label className={styles.choice}>
          <input type="radio" name={`${id}-who`} checked={who === 'all'} onChange={() => setWho('all')} />
          Everyone listening
        </label>
        <label className={styles.choice}>
          <input type="radio" name={`${id}-who`} checked={who === 'chosen'} onChange={() => setWho('chosen')} />
          Chosen characters
        </label>
      </fieldset>
      {who === 'chosen' && (
        <fieldset className={styles.choices}>
          <legend className="visually-hidden">Characters</legend>
          {listening.map(c => (
            <label key={c} className={styles.choice}>
              <input
                type="checkbox"
                checked={chosen.has(c)}
                onChange={e =>
                  setChosen(s => {
                    const next = new Set(s);
                    if (e.target.checked) next.add(c);
                    else next.delete(c);
                    return next;
                  })
                }
              />
              {nameOf(c)}
            </label>
          ))}
        </fieldset>
      )}
      {offer.isError && (
        <p role="alert" className={styles.alert}>
          {friendlyMessage(offer.error)}
        </p>
      )}
      {done && (
        <p role="status" className={styles.done}>
          {done}
        </p>
      )}
      <div>
        <Button type="submit" disabled={offer.isPending || targets.length === 0}>
          Offer to players
        </Button>
      </div>
    </form>
  );
}

function CheckResults({
  campaignId,
  npcId,
  requests,
  nameOf,
}: {
  campaignId: string;
  npcId: string;
  requests: readonly CheckRequest[];
  nameOf: (id: string) => string;
}) {
  const close = useCloseCheck(campaignId);
  const open = requests.filter(r => r.status === 'open' && r.npcId === npcId);
  return (
    <section className={styles.section} aria-label="Open checks">
      <h2 className={styles.sectionTitle}>Open checks</h2>
      {open.length === 0 ? (
        <p className={styles.muted}>No checks waiting.</p>
      ) : (
        <ul className={styles.results}>
          {open.map(r => (
            <li key={r.id} className={styles.result}>
              <div className={`${styles.row} ${styles.spread}`}>
                <span>{`${r.prompt} · ${checkName(r.key, r.kind)} DC ${r.dc}${r.mode !== 'normal' ? ` · ${r.mode}` : ''}${r.showOdds ? '' : ' · odds hidden'}`}</span>
                <Button variant="ghost" disabled={close.isPending} onClick={() => close.mutate(r.id)}>
                  Close
                </Button>
              </div>
              <ul className={styles.answers} aria-label={`Answers to ${r.prompt}`}>
                {r.characterIds.map(c => {
                  const answer = r.answers.find(a => a.characterId === c);
                  return (
                    <li key={c}>
                      {nameOf(c)}:{' '}
                      {answer ? (
                        <span className={answer.roll.success ? styles.success : styles.failure}>
                          {`${answer.roll.total} (${answer.roll.success ? 'success' : 'failure'})`}
                        </span>
                      ) : (
                        <span className={styles.muted}>waiting</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
