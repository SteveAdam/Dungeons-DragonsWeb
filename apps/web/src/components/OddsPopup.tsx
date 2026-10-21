import { useEffect } from 'react';
import { resolveRollMode, successChance } from '@dnd-manager/rules-engine';

type OddsPopupProps = {
  isOpen: boolean;
  title: string;
  dc: number;
  bonus: number;
  advantage?: boolean;
  disadvantage?: boolean;
  onClose: () => void;
};

export function OddsPopup({
  isOpen,
  title,
  dc,
  bonus,
  advantage = false,
  disadvantage = false,
  onClose,
}: OddsPopupProps) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const { mode } = resolveRollMode({
    advantage: advantage ? ['Advantage'] : [],
    disadvantage: disadvantage ? ['Disadvantage'] : [],
  });
  const chance = successChance({ kind: 'check', bonus, target: dc, mode }).final;
  const chancePercent = `${(chance * 100).toFixed(1)}%`;

  return (
    <div className="odds-overlay" role="presentation" onClick={onClose}>
      <div
        className="odds-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="odds-title"
        onClick={event => event.stopPropagation()}
      >
        <button type="button" className="close-button" onClick={onClose} aria-label="Close odds panel">
          ×
        </button>
        <h2 id="odds-title">{title}</h2>
        <div className="odds-grid">
          <div>
            <span>Target DC</span>
            <strong>{dc}</strong>
          </div>
          <div>
            <span>Roll bonus</span>
            <strong>{bonus >= 0 ? `+${bonus}` : bonus}</strong>
          </div>
          <div>
            <span>Condition</span>
            <strong>{advantage ? 'Advantage' : disadvantage ? 'Disadvantage' : 'Normal'}</strong>
          </div>
          <div>
            <span>Success chance</span>
            <strong>{chancePercent}</strong>
          </div>
        </div>
        <div className="odds-breakdown">
          <p>
            Roll a d20 and add {bonus >= 0 ? `+${bonus}` : bonus}. Against DC {dc}, this check succeeds
            {chance >= 0.5 ? ' often enough to be worth the risk.' : ' only when the dice favor you.'}
          </p>
          <div className="dice-row" aria-label="d20 dice preview">
            {[1, 10, 20].map(die => (
              <div key={die} className="die-face">
                {die}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OddsPopup;
