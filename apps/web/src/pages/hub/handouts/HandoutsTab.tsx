// P4-4: the DM's handouts library. Make a handout (an image or a text), change it, delete it, and show it to everyone,
// one party group or chosen players; each handout lists who has it and whether they have opened it.
import { Eye, Image as ImageIcon, Pencil, Plus, ScrollText, Send, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorNotice } from '../../../components/ErrorNotice';
import { HandoutViewer } from '../../../components/handouts/HandoutViewer';
import { Button, ICON_PROPS, iconClasses } from '../../../components/ui';
import { friendlyMessage } from '../../../data/errors';
import type { Handout } from '../../../data/handouts';
import {
  useCreateHandout,
  useDeleteHandout,
  useHandouts,
  useShowHandout,
  useTakeBackHandout,
  useUpdateHandout,
} from '../../../hooks/useHandouts';
import { usePartyGroups } from '../../../hooks/useHere';
import { useMembers } from '../../../hooks/useMembers';
import type { HandoutImageStore } from '../../../lib/storage';
import { HandoutForm } from './HandoutForm';
import { ShowToForm } from './ShowToForm';
import styles from './handouts.module.css';

type Open = { kind: 'new' } | { kind: 'edit' | 'show' | 'view' | 'delete'; id: string } | null;

const names = (list: string[]) =>
  list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;

export function HandoutsTab({ campaignId, store }: { campaignId: string; store?: HandoutImageStore }) {
  const handouts = useHandouts(campaignId);
  const members = useMembers(campaignId);
  const groups = usePartyGroups(campaignId, true);
  const create = useCreateHandout(campaignId, store);
  const update = useUpdateHandout(campaignId, store);
  const remove = useDeleteHandout(campaignId, store);
  const show = useShowHandout(campaignId);
  const takeBack = useTakeBackHandout(campaignId);
  const [open, setOpen] = useState<Open>(null);
  const [shown, setShown] = useState<{ id: string; text: string } | null>(null);

  if (handouts.isError) return <ErrorNotice error={handouts.error} onRetry={() => handouts.refetch()} />;
  if (!handouts.data) return <p className={styles.intro}>Gathering your handouts…</p>;

  const players = (members.data ?? []).filter(m => m.role === 'player');
  const nameOf = (userId: string) => players.find(p => p.userId === userId)?.displayName ?? 'A former player';
  const openId = open && open.kind !== 'new' ? open.id : null;
  const close = () => {
    setOpen(null);
    create.reset();
    update.reset();
    show.reset();
    remove.reset();
  };

  const row = (h: Handout) => {
    const Icon = h.kind === 'image' ? ImageIcon : ScrollText;
    return (
      <li key={h.id} className={styles.handout}>
        <div className={styles.head}>
          <Icon {...ICON_PROPS} aria-hidden="true" />
          <h3 className={styles.name}>{h.title}</h3>
          <span className={styles.kind}>{h.kind === 'image' ? 'Image' : 'Text'}</span>
        </div>
        {h.shares.length === 0 ? (
          <p className={styles.audience}>Not shown to anyone yet.</p>
        ) : (
          <ul className={styles.shares} aria-label={`Who has “${h.title}”`}>
            {h.shares.map(s => (
              <li key={s.userId} className={styles.share}>
                {`${nameOf(s.userId)} · ${s.seenAt ? 'opened' : 'new'}`}
                <Button
                  variant="ghost"
                  aria-label={`Take “${h.title}” back from ${nameOf(s.userId)}`}
                  disabled={takeBack.isPending}
                  onClick={() => takeBack.mutate({ handoutId: h.id, userId: s.userId })}
                >
                  <Undo2 {...ICON_PROPS} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {shown?.id === h.id && (
          <p role="status" className={styles.done}>
            {shown.text}
          </p>
        )}
        <div className={styles.buttons}>
          <Button className={iconClasses.host} onClick={() => setOpen({ kind: 'show', id: h.id })}>
            <Send {...ICON_PROPS} className={iconClasses.icon} />
            Show to…
          </Button>
          <Button variant="ghost" className={iconClasses.host} onClick={() => setOpen({ kind: 'view', id: h.id })}>
            <Eye {...ICON_PROPS} className={iconClasses.icon} />
            Preview
          </Button>
          <Button variant="ghost" className={iconClasses.host} onClick={() => setOpen({ kind: 'edit', id: h.id })}>
            <Pencil {...ICON_PROPS} className={iconClasses.icon} />
            Edit
          </Button>
          <Button variant="ghost" className={iconClasses.host} onClick={() => setOpen({ kind: 'delete', id: h.id })}>
            <Trash2 {...ICON_PROPS} className={iconClasses.icon} />
            Delete
          </Button>
        </div>

        {openId === h.id && open?.kind === 'edit' && (
          <HandoutForm
            handout={h}
            busy={update.isPending}
            error={update.error}
            onCancel={close}
            onSave={input => update.mutate({ handout: h, input }, { onSuccess: close })}
          />
        )}
        {openId === h.id && open?.kind === 'show' && (
          <ShowToForm
            title={h.title}
            players={players.map(p => ({ userId: p.userId, name: p.displayName }))}
            groups={(groups.data ?? []).map(g => ({ id: g.id, name: g.name }))}
            busy={show.isPending}
            error={show.error}
            onCancel={close}
            onShow={audience =>
              show.mutate(
                { handoutId: h.id, audience },
                {
                  onSuccess: userIds => {
                    close();
                    setShown({ id: h.id, text: `Shown to ${names(userIds.map(nameOf))}.` });
                  },
                },
              )
            }
          />
        )}
        {openId === h.id && open?.kind === 'delete' && (
          <div role="group" aria-label="Confirm delete" className={styles.form}>
            <p className={styles.intro}>
              {h.shares.length > 0
                ? `Delete “${h.title}” for good? The ${h.shares.length === 1 ? 'player who has it loses' : `${h.shares.length} players who have it lose`} it too.`
                : `Delete “${h.title}” for good?`}
            </p>
            {remove.isError && (
              <p role="alert" className={styles.alert}>
                {friendlyMessage(remove.error)}
              </p>
            )}
            <div className={styles.buttons}>
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(h, { onSuccess: close })}
              >
                {remove.isPending ? 'Deleting…' : 'Delete it'}
              </Button>
              <Button variant="ghost" onClick={close}>
                Keep it
              </Button>
            </div>
          </div>
        )}
        {openId === h.id && open?.kind === 'view' && <HandoutViewer handout={h} store={store} onClose={close} />}
      </li>
    );
  };

  return (
    <div className={styles.list}>
      <div className={styles.top}>
        <p className={styles.intro}>Letters, maps and riddles to show the players. Text is shown exactly as written.</p>
        {open?.kind !== 'new' && (
          <Button className={iconClasses.host} onClick={() => setOpen({ kind: 'new' })}>
            <Plus {...ICON_PROPS} className={iconClasses.icon} />
            New handout
          </Button>
        )}
      </div>
      {open?.kind === 'new' && (
        <HandoutForm
          busy={create.isPending}
          error={create.error}
          onCancel={close}
          onSave={input => create.mutate(input, { onSuccess: close })}
        />
      )}
      {handouts.data.length === 0 && open?.kind !== 'new' ? (
        <EmptyState title="No handouts yet">Make one, then show it to the table when the moment comes.</EmptyState>
      ) : (
        <ul className={styles.list} aria-label="Handouts">
          {handouts.data.map(row)}
        </ul>
      )}
    </div>
  );
}
