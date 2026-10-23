// P2-9: the character creation wizard. One step per screen with a progress ribbon; each step is checked with the
// rules engine before the next can be reached, and the draft is saved at every step (and right after a roll), so a
// refresh comes back to the same place. The server checks everything again when the character is created.
import {
  abilityRollTotals,
  CREATION_STEPS,
  creationProblems,
  type CreationChoices,
  type CreationProblem,
} from '@dnd-manager/rules-engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui';
import {
  createCharacter,
  CreationRejected,
  rollAbilityScores,
  saveDraft,
  type AbilityRoll,
  type CreationDraft,
  type WizardSrd,
} from '../../../data/creation';
import { friendlyMessage } from '../../../data/errors';
import { queryKeys } from '../../../hooks/queryKeys';
import styles from './create.module.css';
import { blankChoices } from './blankChoices';
import { Review } from './Review';
import {
  AbilitiesStep,
  BackgroundStep,
  ClassStep,
  DetailsStep,
  EquipmentStep,
  OriginStep,
  SkillsStep,
  SpellsStep,
} from './steps';

const STEPS = [
  { id: 'origin', title: 'Name and species' },
  { id: 'class', title: 'Class' },
  { id: 'background', title: 'Background' },
  { id: 'abilities', title: 'Ability scores' },
  { id: 'skills', title: 'Skills' },
  { id: 'equipment', title: 'Equipment' },
  { id: 'spells', title: 'Spells' },
  { id: 'details', title: 'Details' },
  { id: 'review', title: 'Review' },
] as const;
const REVIEW = STEPS.length - 1;

export function Wizard({
  campaignId,
  srd,
  start,
}: {
  campaignId: string;
  srd: WizardSrd;
  start: CreationDraft | null;
}) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [step, setStep] = useState(start?.step ?? 0);
  const [choices, setChoices] = useState<CreationChoices>(start?.choices ?? blankChoices());
  const [roll, setRoll] = useState<AbilityRoll | null>(start?.roll ?? null);
  const [problems, setProblems] = useState<CreationProblem[]>([]);
  const save = useMutation({ mutationFn: (d: CreationDraft) => saveDraft(campaignId, d) });
  const totals = roll ? abilityRollTotals(roll.dice) : undefined;

  const rollScores = useMutation({
    mutationFn: () => rollAbilityScores(campaignId),
    onSuccess: r => {
      const t = abilityRollTotals(r.dice);
      const next: CreationChoices = {
        ...choices,
        abilities: {
          method: 'roll',
          rollId: r.id,
          base: { str: t[0], dex: t[1], con: t[2], int: t[3], wis: t[4], cha: t[5] },
        },
      };
      setRoll(r);
      setChoices(next);
      // kept at once, so a refresh shows the same roll
      save.mutate({ step, choices: next, roll: r });
    },
  });

  const create = useMutation({
    mutationFn: () => createCharacter(campaignId, choices),
    onSuccess: id => {
      void client.invalidateQueries({ queryKey: queryKeys.characters(campaignId) });
      navigate(`/campaigns/${campaignId}/characters/${id}`);
    },
    onError: e => {
      if (e instanceof CreationRejected && e.problems.length) {
        setProblems(e.problems);
        setStep(CREATION_STEPS.indexOf(e.problems[0].step));
      }
    },
  });

  const change = (patch: Partial<CreationChoices>) => {
    setChoices(c => ({ ...c, ...patch }));
    setProblems([]);
  };

  function go(to: number) {
    if (to > step) {
      // forward only past steps whose choices keep the rules
      const checks = CREATION_STEPS.slice(0, Math.min(to, CREATION_STEPS.length));
      const found = creationProblems(choices, srd, totals, checks);
      if (found.length) {
        setProblems(found);
        setStep(CREATION_STEPS.indexOf(found[0].step));
        return;
      }
    }
    setProblems([]);
    setStep(to);
    save.mutate({ step: to, choices, roll });
  }

  const current = STEPS[step];
  const props = { srd, choices, onChange: change };
  const stepProblems = problems.filter(p => p.step === current.id);

  return (
    <div className={styles.wizard}>
      <nav aria-label="Creation steps">
        <ol className={styles.ribbon}>
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              aria-current={i === step ? 'step' : undefined}
              className={i < step ? styles.done : undefined}
            >
              <span className={styles.stepNumber}>{i + 1}</span>
              <span className={styles.stepTitle}>{s.title}</span>
            </li>
          ))}
        </ol>
      </nav>

      <section aria-labelledby="step-title" className={styles.step}>
        <h2 id="step-title" className={styles.heading}>{`${step + 1}. ${current.title}`}</h2>
        {current.id === 'origin' && <OriginStep {...props} />}
        {current.id === 'class' && <ClassStep {...props} />}
        {current.id === 'background' && <BackgroundStep {...props} />}
        {current.id === 'abilities' && (
          <AbilitiesStep
            {...props}
            roll={roll}
            onRoll={() => rollScores.mutate()}
            rolling={rollScores.isPending}
            rollError={rollScores.error}
          />
        )}
        {current.id === 'skills' && <SkillsStep {...props} />}
        {current.id === 'equipment' && <EquipmentStep {...props} />}
        {current.id === 'spells' && <SpellsStep {...props} />}
        {current.id === 'details' && <DetailsStep {...props} />}
        {current.id === 'review' && <Review srd={srd} choices={choices} />}

        {stepProblems.length > 0 && (
          <ul role="alert" className={styles.problems}>
            {stepProblems.map(p => (
              <li key={p.message}>{p.message}</li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.nav}>
        <Button variant="ghost" disabled={step === 0} onClick={() => go(step - 1)}>
          Back
        </Button>
        {step < REVIEW ? (
          <Button onClick={() => go(step + 1)}>Next</Button>
        ) : (
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create character'}
          </Button>
        )}
        <span className={styles.saved} role="status">
          {save.isPending ? 'Saving…' : save.isError ? '' : save.isSuccess ? 'Draft saved' : ''}
        </span>
      </div>
      {save.isError && (
        <p role="alert" className={styles.alert}>
          {`Your draft could not be saved: ${friendlyMessage(save.error)}`}
        </p>
      )}
      {create.isError && !(create.error instanceof CreationRejected && create.error.problems.length) && (
        <p role="alert" className={styles.alert}>
          {friendlyMessage(create.error)}
        </p>
      )}
    </div>
  );
}
