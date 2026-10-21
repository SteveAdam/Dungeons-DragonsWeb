import { useMemo, useState } from 'react';
import { CharacterSheet } from '../components/CharacterSheet';
import { OddsPopup } from '../components/OddsPopup';
import { DisplaySettingsControls } from '../components/DisplaySettingsControls';
import '../styles/sheet.css';

/** The original character-sheet prototype, kept as a demo page at /sheet. */
export function SheetDemoPage() {
  const [potionActive, setPotionActive] = useState(false);
  const [odds, setOdds] = useState<{
    title: string;
    dc: number;
    bonus: number;
    advantage?: boolean;
    disadvantage?: boolean;
  } | null>(null);

  const oddsPanel = useMemo(
    () => ({
      title: odds?.title ?? 'Ability Check',
      dc: odds?.dc ?? 15,
      bonus: odds?.bonus ?? 0,
      advantage: odds?.advantage,
      disadvantage: odds?.disadvantage,
    }),
    [odds],
  );

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <p className="eyebrow">Campaign Ledger</p>
          <h2>D&D MASTER</h2>
        </div>
        <div className="toggle-group">
          <label>
            <input type="checkbox" checked={potionActive} onChange={() => setPotionActive(value => !value)} />
            Potion of Heroism
          </label>
          <DisplaySettingsControls />
        </div>
      </div>

      <CharacterSheet
        potionActive={potionActive}
        onRoll={(title, dc, bonus, advantage, disadvantage) => {
          setOdds({ title, dc, bonus, advantage, disadvantage });
        }}
      />

      <OddsPopup
        isOpen={!!odds}
        title={oddsPanel.title}
        dc={oddsPanel.dc}
        bonus={oddsPanel.bonus}
        advantage={oddsPanel.advantage}
        disadvantage={oddsPanel.disadvantage}
        onClose={() => setOdds(null)}
      />
    </div>
  );
}
