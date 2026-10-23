// P2-9: /campaigns/:campaignId/characters/new. Loads the SRD records and the player's draft, then the wizard.
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { ErrorNotice } from '../../../components/ErrorNotice';
import { IconLink, Paper } from '../../../components/ui';
import { getDraft, loadCreationSrd } from '../../../data/creation';
import { queryKeys } from '../../../hooks/queryKeys';
import styles from './create.module.css';
import { Wizard } from './Wizard';

export default function CreateCharacterPage() {
  const { campaignId = '' } = useParams();
  const srd = useQuery({ queryKey: queryKeys.creationSrd, queryFn: loadCreationSrd, staleTime: Infinity });
  const draft = useQuery({
    queryKey: queryKeys.creationDraft(campaignId),
    queryFn: () => getDraft(campaignId),
    enabled: !!campaignId,
    // the wizard keeps its own state once open; a refetch must not reset it
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const failed = [srd, draft].find(q => q.isError);

  return (
    <main className={styles.page}>
      <IconLink to={`/campaigns/${campaignId}/characters`} end icon={ArrowLeft}>
        Back to the characters
      </IconLink>
      <Paper as="section" texture="full" className={styles.paper} aria-labelledby="create-title">
        <h1 id="create-title" className={styles.title}>
          Create a character
        </h1>
        {failed ? (
          <ErrorNotice error={failed.error} onRetry={() => failed.refetch()} />
        ) : !srd.data || draft.isPending ? (
          <p role="status" className={styles.muted}>
            Laying out the blank sheet…
          </p>
        ) : srd.data.classes.length === 0 ? (
          <p className={styles.muted}>The SRD has not been imported yet. Run pnpm srd:import.</p>
        ) : (
          <Wizard campaignId={campaignId} srd={srd.data} start={draft.data ?? null} />
        )}
      </Paper>
    </main>
  );
}
