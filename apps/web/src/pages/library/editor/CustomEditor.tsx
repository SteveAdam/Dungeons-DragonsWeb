// P3-6: clone an SRD entry, start one from a template, or change a custom one, with the comparison and balance guide
// beside the form as it is filled in.
import {
  normaliseDefinition,
  validateCustomDefinition,
  type CustomKind,
  type Definition,
} from '@dnd-manager/rules-engine';
import { CR_BENCHMARKS } from '@dnd-manager/srd-data/benchmarks';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Button, Input, Paper, Tag } from '../../../components/ui';
import type { CustomEntry } from '../../../data/customContent';
import { friendlyMessage } from '../../../data/errors';
import { useSaveCustomContent } from '../../../hooks/useCustomContent';
import styles from '../Library.module.css';
import { BalancePanel, ComparePanel } from './ComparePanels';
import { KIND_LABELS } from './customForms';
import { DefinitionForm } from './DefinitionForm';

export interface EditorRequest {
  kind: CustomKind;
  name: string;
  definition: Definition;
  /** The SRD entry it comes from. */
  parent: { id: string; name: string; definition: Definition } | null;
  /** The entry being changed; none for a new one. */
  entry?: CustomEntry;
}

const RATINGS = CR_BENCHMARKS.map(b => b.challengeRating);

interface Props {
  campaignId: string;
  request: EditorRequest;
  onClose: () => void;
  onSaved: (entry: CustomEntry) => void;
}

export function CustomEditor({ campaignId, request, onClose, onSaved }: Props) {
  const id = useId();
  const { kind, parent, entry } = request;
  const [name, setName] = useState(request.name);
  const [definition, setDefinition] = useState(request.definition);
  const [problems, setProblems] = useState<string[]>([]);
  const save = useSaveCustomContent(campaignId);
  // what will be saved, so the comparison shows the same XP and proficiency the entry will have
  const final = useMemo(() => normaliseDefinition(kind, definition), [kind, definition]);
  const { textOnly, unsupported } = validateCustomDefinition(kind, final);
  const what = KIND_LABELS[kind];
  const title = entry ? `Change ${entry.name}` : parent ? `Clone ${parent.name}` : `New ${what} from template`;

  function submit(e: FormEvent) {
    e.preventDefault();
    const { errors } = validateCustomDefinition(kind, final);
    setProblems(errors);
    if (errors.length > 0) return;
    save.mutate(
      { id: entry?.id, campaignId, kind, name, parentRef: parent?.id ?? null, definition: final },
      { onSuccess: onSaved },
    );
  }

  return (
    <div className={styles.editor}>
      <Paper as="form" texture="flat" className={styles.editorForm} aria-labelledby={`${id}-title`} onSubmit={submit}>
        <h2 id={`${id}-title`} className={styles.detailName}>
          {title}
        </h2>
        <div className={styles.filterField}>
          <label htmlFor={`${id}-name`}>Name</label>
          <Input id={`${id}-name`} value={name} maxLength={120} onChange={e => setName(e.target.value)} />
        </div>
        {textOnly && (
          <p className={styles.tags}>
            <Tag>TEXT ONLY</Tag>
            <span>{`The engine cannot calculate: ${unsupported.join('; ')}.`}</span>
          </p>
        )}
        <DefinitionForm kind={kind} value={definition} onChange={setDefinition} challengeRatings={RATINGS} />
        {problems.length > 0 && (
          <ul role="alert" className={styles.problems}>
            {problems.map(p => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {save.isError && (
          <p role="alert" className={styles.problems}>
            {friendlyMessage(save.error)}
          </p>
        )}
        <div className={styles.actions}>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : `Save ${what}`}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </Paper>
      <Paper texture="flat" className={styles.editorSide}>
        {parent && (
          <ComparePanel
            kind={kind}
            parentName={parent.name}
            parent={parent.definition}
            variantName={name}
            variant={final}
          />
        )}
        <BalancePanel kind={kind} definition={final} />
      </Paper>
    </div>
  );
}
