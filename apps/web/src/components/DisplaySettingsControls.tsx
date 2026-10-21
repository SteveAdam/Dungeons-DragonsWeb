import { useDisplaySettings } from '../state/displaySettings';
import { Toggle } from './ui';

/** The two display settings as switches. Used in the header menu and on /theme. */
export function DisplaySettingsControls() {
  const { reduceTexture, plainFont, setReduceTexture, setPlainFont } = useDisplaySettings();
  return (
    <>
      <Toggle checked={reduceTexture} onChange={setReduceTexture} label="Reduce texture" />
      <Toggle checked={plainFont} onChange={setPlainFont} label="Plain font" />
    </>
  );
}
