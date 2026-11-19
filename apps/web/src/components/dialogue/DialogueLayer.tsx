// P4-6: a player's side of NPC dialogue, on every screen of the campaign. When the DM says a line to their group, the
// speech scroll appears with the response options: a "say" option tells the DM what they chose; a check option, or a
// check the DM offered on its own, opens the odds popup with the server's preview for that request. Mounted once, in
// the app shell, for players.
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { previewRequest, type MyCheckRequest, type ShownOption } from '../../data/dialogue';
import { useCharacters } from '../../hooks/useCharacters';
import { invalidateMyRequests, useLatestLine, useMyRequests } from '../../hooks/useDialogue';
import { useMyRole } from '../../hooks/useMembers';
import { useRealtime } from '../../hooks/useRealtime';
import { useToasts } from '../../state/toasts';
import { Button, Paper } from '../ui';
import { checkName } from './checkWords';
import styles from './Dialogue.module.css';
import { RequestRoll } from './RequestRoll';
import { SpeechScroll } from './SpeechScroll';

/** The first of this player's characters in the request that has not answered yet, if any. */
const unanswered = (r: MyCheckRequest) => r.characterIds.find(id => !r.answered.includes(id)) ?? null;

export function DialogueLayer({ campaignId }: { campaignId: string }) {
  const role = useMyRole(campaignId);
  const isPlayer = role.data === 'player';
  const realtime = useRealtime();
  const client = useQueryClient();
  const push = useToasts(s => s.push);
  const { line, dismiss } = useLatestLine();
  const requests = useMyRequests(campaignId, isPlayer);
  const characters = useCharacters(campaignId);
  const [chosen, setChosen] = useState<{ lineKey: string; index: number } | null>(null);
  const [rolling, setRolling] = useState<{ request: MyCheckRequest; characterId: string } | null>(null);

  const open = (requests.data ?? []).filter(r => r.status === 'open' && unanswered(r));
  // the odds on the scroll's check options, from the server, when the DM shows them
  const shownChecks = (line?.options ?? []).filter(
    (o): o is ShownOption & { requestId: string } => !!o.requestId && !!o.check?.showOdds,
  );
  const previews = useQueries({
    queries: shownChecks.map(o => {
      const request = open.find(r => r.id === o.requestId);
      const characterId = request ? unanswered(request) : null;
      return {
        queryKey: ['request-preview', o.requestId, characterId],
        queryFn: () => previewRequest(campaignId, characterId as string, o.requestId),
        enabled: !!characterId,
      };
    }),
  });

  if (!isPlayer) return null;
  const nameOf = (id: string) => characters.data?.find(c => c.id === id)?.name ?? 'your character';
  const lineRequestIds = new Set((line?.options ?? []).map(o => o.requestId).filter(Boolean));
  const offers = open.filter(r => !lineRequestIds.has(r.id));

  function choose(index: number) {
    if (!line) return;
    const option = line.options[index];
    if (option.kind === 'check') {
      const request = open.find(r => r.id === option.requestId);
      const characterId = request ? unanswered(request) : null;
      if (request && characterId) setRolling({ request, characterId });
      else push('That check has been answered or closed.');
      return;
    }
    setChosen({ lineKey: line.lineKey, index });
    void realtime?.send('dm', 'dialogue_choice', {
      npcId: line.npcId,
      lineKey: line.lineKey,
      optionIndex: index,
      label: option.label,
    });
    if (option.kind === 'end') dismiss();
  }

  const chanceFor = (o: ShownOption) => {
    const i = shownChecks.findIndex(c => c.requestId === o.requestId);
    const chance = i >= 0 ? previews[i]?.data?.chance : null;
    return typeof chance === 'number' ? `${Math.round(chance * 100)}%` : null;
  };

  return (
    <div className={styles.layer}>
      {line && (
        <SpeechScroll
          line={line}
          chosen={chosen?.lineKey === line.lineKey ? chosen.index : null}
          onChoose={choose}
          chanceFor={chanceFor}
          onClose={dismiss}
        />
      )}
      {offers.length > 0 && (
        <Paper as="section" texture="full" aria-label="Checks for you" className={styles.offers}>
          <h2 className={styles.offersTitle}>The DM asks for a check</h2>
          {offers.map(r => {
            const characterId = unanswered(r);
            return (
              <div key={r.id} className={styles.offer}>
                <p className={styles.offerText}>
                  {r.prompt}
                  <span className={styles.muted}>
                    {` · ${checkName(r.key, r.kind)}${r.dc !== null ? ` DC ${r.dc}` : ''} · ${nameOf(characterId ?? '')}`}
                  </span>
                </p>
                <Button
                  variant="die"
                  onClick={() => characterId && setRolling({ request: r, characterId })}
                  aria-label={`Roll ${checkName(r.key, r.kind)} for ${nameOf(characterId ?? '')}`}
                >
                  Roll
                </Button>
              </div>
            );
          })}
        </Paper>
      )}
      {rolling && (
        <RequestRoll
          campaignId={campaignId}
          request={rolling.request}
          characterId={rolling.characterId}
          onClose={() => setRolling(null)}
          onRolled={() => void invalidateMyRequests(client, campaignId)}
        />
      )}
    </div>
  );
}
