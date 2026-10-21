import { useState } from 'react';
import { DisplaySettingsControls } from '../components/DisplaySettingsControls';
import { Button, DmBanner, Input, Paper, RibbonTabs, Tag, Toggle } from '../components/ui';
import styles from './ThemePage.module.css';

const SWATCHES = [
  'paper',
  'paper-aged',
  'ink',
  'ink-faded',
  'wax-red',
  'gold',
  'gold-dark',
  'verdigris',
  'desk',
  'iron',
];
const TABS = [
  { id: 'maps', label: 'Maps' },
  { id: 'notes', label: 'Notes' },
  { id: 'web', label: 'Web' },
  { id: 'people', label: 'People' },
];

/** Every UI kit component and both display settings. Registered only in development builds (see App.tsx). */
export default function ThemePage() {
  const [tab, setTab] = useState('maps');
  const [toggle, setToggle] = useState(true);
  const [text, setText] = useState('The Sunken Crown');

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Theme</h1>

      <section aria-labelledby="settings" className={styles.settings}>
        <h2 id="settings" className={styles.heading}>
          Display settings
        </h2>
        <DisplaySettingsControls />
      </section>

      <section aria-labelledby="tokens">
        <h2 id="tokens" className={styles.heading}>
          Tokens
        </h2>
        <ul className={styles.swatches}>
          {SWATCHES.map(name => (
            <li key={name} className={styles.swatch}>
              <span className={styles.chip} style={{ background: `var(--${name})` }} />
              <code>{`--${name}`}</code>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="banner">
        <h2 id="banner" className={styles.heading}>
          DmBanner
        </h2>
        <DmBanner />
      </section>

      <div className={styles.grid}>
        <Paper as="section" aria-labelledby="paper" className={styles.panel}>
          <h2 id="paper" className={styles.panelHeading}>
            Paper
          </h2>
          <p>
            Body text in IM Fell English. <em>Ink-faded text sits on paper only.</em>
          </p>
          <p className={styles.faded}>Secondary text in ink-faded.</p>
        </Paper>

        <Paper as="section" variant="torn" aria-labelledby="torn" className={styles.panel}>
          <h2 id="torn" className={styles.panelHeading}>
            Paper, torn
          </h2>
          <p>The ragged edge comes from a clip-path.</p>
        </Paper>

        <Paper
          as="section"
          variant="framed"
          aria-labelledby="framed"
          className={`${styles.panel} ${styles.framedPanel}`}
        >
          <h2 id="framed" className={styles.panelHeading}>
            Paper, framed
          </h2>
          <p>For hero cards: sign-in and the home page.</p>
        </Paper>

        <Paper as="section" aria-labelledby="controls" className={styles.panel}>
          <h2 id="controls" className={styles.panelHeading}>
            Buttons, tags, toggle
          </h2>
          <div className={styles.row}>
            <Button>Primary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className={styles.row}>
            <Tag>DM</Tag>
            <Tag>Player</Tag>
            <Tag>Hidden from players</Tag>
          </div>
          <Toggle checked={toggle} onChange={setToggle} label="DM mode" />
        </Paper>

        <Paper as="section" texture="flat" aria-labelledby="input" className={styles.panel}>
          <h2 id="input" className={styles.panelHeading}>
            Input (flat paper: forms and dense panels)
          </h2>
          <label htmlFor="theme-input">Campaign name</label>
          <Input id="theme-input" value={text} onChange={e => setText(e.target.value)} />
        </Paper>
      </div>

      <section aria-labelledby="tabs">
        <h2 id="tabs" className={styles.heading}>
          Ribbon tabs
        </h2>
        <RibbonTabs aria-label="Example sections" tabs={TABS} value={tab} onChange={setTab} />
        <p className={styles.note}>{`Selected: ${tab}`}</p>
      </section>
    </main>
  );
}
