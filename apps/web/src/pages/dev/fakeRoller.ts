// Development only: an in-memory stand-in for the server's roll, so the odds popup can be tried without a
// database. The verdict comes from the rules engine's rollOutcome, the same rules as the server.
import { rollOutcome, type RollMode } from '@dnd-manager/rules-engine';
import type { RollRow } from '../../data/rolls';
import type { OddsCheck } from '../../components/odds/OddsPopup';

const d20 = () => Math.floor(Math.random() * 20) + 1;

export async function fakeRoll(check: OddsCheck, mode: RollMode): Promise<RollRow> {
  // a short pause, like a real request, so the rolling state can be seen
  await new Promise(resolve => setTimeout(resolve, 400));
  const dice = mode === 'normal' ? [d20()] : [d20(), d20()];
  const outcome = rollOutcome({ kind: check.kind, mode, dice, bonus: check.bonus, target: check.target });
  return {
    id: crypto.randomUUID(),
    campaignId: 'dev',
    characterId: null,
    rolledBy: 'dev',
    kind: check.kind,
    label: check.label,
    bonus: check.bonus,
    bonusBreakdown: check.bonusBreakdown ?? null,
    target: check.target,
    mode,
    dice,
    ...outcome,
    hidden: false,
    createdAt: new Date().toISOString(),
  };
}
