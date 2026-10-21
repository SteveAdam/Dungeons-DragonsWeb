import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DisplaySettingsControls } from '../components/DisplaySettingsControls';
import { DISPLAY_SETTINGS_KEY, useDisplaySettings } from './displaySettings';

const html = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  useDisplaySettings.setState({ reduceTexture: false, plainFont: false });
});

describe('display settings', () => {
  it('apply to <html> straight away and are saved', async () => {
    const user = userEvent.setup();
    render(<DisplaySettingsControls />);
    expect(html.dataset.reduceTexture).toBe('false');

    await user.click(screen.getByRole('switch', { name: /Reduce texture/ }));
    expect(html.dataset.reduceTexture).toBe('true');
    await user.click(screen.getByRole('switch', { name: /Plain font/ }));
    expect(html.dataset.plainFont).toBe('true');

    const saved = JSON.parse(localStorage.getItem(DISPLAY_SETTINGS_KEY) ?? '{}');
    expect(saved.state).toEqual({ reduceTexture: true, plainFont: true });
  });

  it('come back after a reload', async () => {
    localStorage.setItem(
      DISPLAY_SETTINGS_KEY,
      JSON.stringify({ state: { reduceTexture: true, plainFont: false }, version: 0 }),
    );
    await useDisplaySettings.persist.rehydrate();
    expect(useDisplaySettings.getState().reduceTexture).toBe(true);
    expect(html.dataset.reduceTexture).toBe('true');
    render(<DisplaySettingsControls />);
    expect(screen.getByRole('switch', { name: /Reduce texture/ })).toBeChecked();
  });
});
