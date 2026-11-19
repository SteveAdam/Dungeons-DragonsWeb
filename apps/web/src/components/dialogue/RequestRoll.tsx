// P4-6: answering a check the DM offered. The odds popup shows the server's own preview for that request (skill, DC,
// mode and reason all come from it); with the odds hidden the percentage is not shown, but the bonus is. Roll answers
// it, once.
import { useQuery } from '@tanstack/react-query';
import { friendlyMessage } from '../../data/errors';
import { answerRequest, previewRequest, type MyCheckRequest } from '../../data/dialogue';
import { OddsPopup } from '../odds/OddsPopup';
import { checkName } from './checkWords';

interface RequestRollProps {
  campaignId: string;
  request: MyCheckRequest;
  characterId: string;
  onClose: () => void;
  onRolled: () => void;
}

export function RequestRoll({ campaignId, request, characterId, onClose, onRolled }: RequestRollProps) {
  const preview = useQuery({
    queryKey: ['request-preview', request.id, characterId],
    queryFn: () => previewRequest(campaignId, characterId, request.id),
    staleTime: 0,
  });
  const p = preview.data;
  return (
    <OddsPopup
      open
      onClose={onClose}
      hideOdds={!request.showOdds}
      waiting={preview.isPending ? 'Asking the DM’s table for your odds…' : undefined}
      problem={preview.isError ? friendlyMessage(preview.error) : (p?.autoFail ?? undefined)}
      check={{
        label: request.prompt,
        kind: request.kind,
        skill: checkName(request.key),
        bonus: p?.bonus ?? 0,
        bonusBreakdown: p?.bonusBreakdown,
        target: request.dc ?? 10,
        ...(p ? { server: { mode: p.mode, reasons: p.reasons, chance: p.chance ?? 0, critChance: p.critChance } } : {}),
      }}
      onRoll={async () => {
        const roll = await answerRequest(campaignId, characterId, request.id);
        onRolled();
        return roll;
      }}
    />
  );
}
