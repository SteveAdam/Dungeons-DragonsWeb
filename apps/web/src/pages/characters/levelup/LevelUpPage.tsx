// P2-10: /campaigns/:campaignId/characters/:characterId/level-up. Pending levels are completed one at a time, in
// order: when one is applied and another is still waiting, the flow starts again for the next.
import { pendingLevels, type LevelUpClass } from '@dnd-manager/rules-engine';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ErrorNotice } from '../../../components/ErrorNotice';
import { IconLink, Paper } from '../../../components/ui';
import { getHitDieRoll, type AppliedLevel } from '../../../data/levelup';
import { listSrdClasses, listSrdSpells } from '../../../data/srd';
import { queryKeys } from '../../../hooks/queryKeys';
import { useCampaign } from '../../../hooks/useCampaigns';
import { useCharacter } from '../../../hooks/useCharacters';
import styles from '../create/create.module.css';
import { LevelUpFlow } from './LevelUpFlow';

export default function LevelUpPage() {
  const { campaignId = '', characterId = '' } = useParams();
  const client = useQueryClient();
  const campaign = useCampaign(campaignId);
  const character = useCharacter(characterId);
  const classes = useQuery({ queryKey: ['srd', 'classes'], queryFn: listSrdClasses, staleTime: Infinity });
  const spells = useQuery({ queryKey: ['srd', 'spells'], queryFn: listSrdSpells, staleTime: Infinity });
  const sheet = character.data?.sheet;
  const nextLevel = (sheet?.levelApplied ?? 1) + 1;
  const roll = useQuery({
    queryKey: queryKeys.hitDieRoll(characterId, nextLevel),
    queryFn: () => getHitDieRoll(characterId, nextLevel),
    enabled: !!sheet,
  });
  const [applied, setApplied] = useState<AppliedLevel | null>(null);
  const back = `/campaigns/${campaignId}/characters/${characterId}`;

  async function onApplied(result: AppliedLevel) {
    setApplied(result);
    await client.invalidateQueries({ queryKey: ['characters', characterId] });
    await client.invalidateQueries({ queryKey: queryKeys.characters(campaignId) });
  }

  const failed = [character, classes, spells, roll, campaign].find(q => q.isError);
  const cls = classes.data?.find(c => c.name === sheet?.className) as LevelUpClass | undefined;
  const pending = sheet ? pendingLevels(sheet) : 0;

  return (
    <main className={styles.page}>
      <IconLink to={back} end icon={ArrowLeft}>
        Back to the sheet
      </IconLink>
      <Paper as="section" texture="full" className={styles.paper} aria-labelledby="level-up-title">
        <h1 id="level-up-title" className={styles.title}>
          {sheet ? `Level up ${sheet.name}` : 'Level up'}
        </h1>
        {applied && (
          <p role="status" className={styles.saved}>
            {`Level ${applied.level} applied: ${applied.hitPoints} hit points (+${applied.hitPointsGained}), proficiency +${applied.proficiencyBonus}.`}
          </p>
        )}
        {failed ? (
          <ErrorNotice error={failed.error} onRetry={() => failed.refetch()} />
        ) : !sheet || !classes.data || !spells.data || roll.isPending ? (
          <p role="status" className={styles.muted}>
            Turning the page…
          </p>
        ) : !cls ? (
          <p className={styles.muted}>{`The SRD has no class called ${sheet.className}.`}</p>
        ) : pending === 0 ? (
          <>
            <p
              className={styles.muted}
            >{`${sheet.name} is level ${sheet.levelApplied ?? 1}, with no level-up waiting.`}</p>
            <IconLink to={back} icon={ScrollText}>
              Open the sheet
            </IconLink>
          </>
        ) : (
          <>
            {pending > 1 && (
              <p
                className={styles.muted}
              >{`${pending} levels are waiting; they are applied one at a time, in order.`}</p>
            )}
            <LevelUpFlow
              // a fresh flow for each level
              key={sheet.levelApplied}
              characterId={characterId}
              sheet={sheet}
              cls={cls}
              spells={spells.data}
              optionalFeats={campaign.data?.optionalFeats ?? false}
              existingRoll={roll.data ?? null}
              onApplied={onApplied}
            />
          </>
        )}
      </Paper>
    </main>
  );
}
