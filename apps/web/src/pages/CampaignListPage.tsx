import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { ErrorNotice } from '../components/ErrorNotice';
import { Button, Input, Paper, Tag } from '../components/ui';
import { friendlyMessage } from '../data/errors';
import { useCampaigns, useCreateCampaign, useJoinCampaign } from '../hooks/useCampaigns';
import styles from './CampaignListPage.module.css';

export function CampaignListPage() {
  const navigate = useNavigate();
  const campaigns = useCampaigns();
  const create = useCreateCampaign();
  const join = useJoinCampaign();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  function onCreate(e: FormEvent) {
    e.preventDefault();
    create.mutate(name, {
      onSuccess: campaign => {
        setName('');
        navigate(`/campaigns/${campaign.id}`);
      },
    });
  }

  function onJoin(e: FormEvent) {
    e.preventDefault();
    join.mutate(code, {
      onSuccess: campaignId => {
        setCode('');
        navigate(`/campaigns/${campaignId}`);
      },
    });
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Your campaigns</h1>

      <section aria-labelledby="my-campaigns">
        <h2 id="my-campaigns" className={styles.sectionTitle}>
          The tables you sit at
        </h2>
        {campaigns.isPending && (
          <p role="status" className={styles.status}>
            Unrolling the scrolls…
          </p>
        )}
        {campaigns.isError && <ErrorNotice error={campaigns.error} onRetry={() => campaigns.refetch()} />}
        {campaigns.isSuccess && campaigns.data.length === 0 && (
          <EmptyState title="No campaigns yet">
            Start your own below, or join one with the code your DM gave you.
          </EmptyState>
        )}
        {campaigns.isSuccess && campaigns.data.length > 0 && (
          <ul className={styles.list}>
            {campaigns.data.map(c => (
              <li key={c.id}>
                <Link to={`/campaigns/${c.id}`} className={styles.card}>
                  <span className={styles.name}>{c.name}</span>
                  <Tag>{`${c.rulesEdition} rules`}</Tag>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.forms}>
        <Paper as="section" texture="flat" aria-labelledby="new-campaign" className={styles.panel}>
          <h2 id="new-campaign" className={styles.panelTitle}>
            New campaign
          </h2>
          <p className={styles.hint}>You become the DM.</p>
          <form onSubmit={onCreate} className={styles.form}>
            <label htmlFor="campaign-name">Campaign name</label>
            <Input
              id="campaign-name"
              value={name}
              maxLength={120}
              autoComplete="off"
              required
              onChange={e => setName(e.target.value)}
            />
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create campaign'}
            </Button>
            {create.isError && (
              <p role="alert" className={styles.error}>
                {friendlyMessage(create.error)}
              </p>
            )}
          </form>
        </Paper>

        <Paper as="section" texture="flat" aria-labelledby="join-campaign" className={styles.panel}>
          <h2 id="join-campaign" className={styles.panelTitle}>
            Join with a code
          </h2>
          <p className={styles.hint}>Your DM can give you a sealed invitation code.</p>
          <form onSubmit={onJoin} className={styles.form}>
            <label htmlFor="invite-code">Invite code</label>
            <Input
              id="invite-code"
              value={code}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              onChange={e => setCode(e.target.value)}
            />
            <Button type="submit" disabled={join.isPending}>
              {join.isPending ? 'Joining…' : 'Join campaign'}
            </Button>
            {join.isError && (
              <p role="alert" className={styles.error}>
                {friendlyMessage(join.error)}
              </p>
            )}
          </form>
        </Paper>
      </div>
    </main>
  );
}
