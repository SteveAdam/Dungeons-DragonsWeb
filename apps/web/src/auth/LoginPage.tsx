import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button, Input, Paper } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useAuth } from './authContext';
import styles from './LoginPage.module.css';

type Mode = 'sign-in' | 'sign-up';

/** Discord's identify (name, avatar) and guilds (server list). Supabase always adds email on top. */
export const DISCORD_SCOPES = 'identify guilds';

/** An OAuth failure comes back in the address (query or hash) as error_description. */
function oauthErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const error = params.get('error') ?? hash.get('error');
  if (!error) return null;
  return error === 'access_denied'
    ? 'Discord sign-in was cancelled. Try again, or use your email instead.'
    : 'Discord sign-in did not work. Try again, or use your email instead.';
}

export function LoginPage() {
  const { session } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/campaigns';
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(oauthErrorFromUrl);
  const [notice, setNotice] = useState<string | null>(null);

  if (session) return <Navigate to={from} replace />;

  async function onDiscord() {
    setBusy(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { scopes: DISCORD_SCOPES, redirectTo: `${window.location.origin}${from}` },
    });
    // On success the browser is already leaving for Discord.
    if (oauthError) {
      setBusy(false);
      setError('Could not reach Discord. Try again, or use your email instead.');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const { data, error: authError } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (authError) {
      setError(
        mode === 'sign-in'
          ? 'That email and password do not match. Try again, or create an account.'
          : 'Could not create the account. Use a valid email and a password of at least 6 characters.',
      );
      return;
    }
    if (mode === 'sign-up' && !data.session) setNotice('Check your email to confirm the account, then sign in.');
  }

  return (
    <main className={styles.page}>
      <Paper as="section" variant="framed" aria-labelledby="login-title" className={styles.card}>
        <h1 id="login-title" className={styles.title}>
          Enter the hall
        </h1>

        <Button onClick={onDiscord} disabled={busy}>
          Continue with Discord
        </Button>
        <p className={styles.privacy}>
          From Discord we read only your name, avatar and server list. Supabase also asks for your email address, which
          we use only to sign you in. We never read your messages.
        </p>

        <p className={styles.divider}>
          <span>or use your email</span>
        </p>

        <form onSubmit={onSubmit} className={styles.form}>
          <label htmlFor="email">Email</label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <label htmlFor="password">Password</label>
          <Input
            id="password"
            type="password"
            minLength={6}
            required
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <Button type="submit" variant="ghost" disabled={busy}>
            {busy ? 'One moment…' : mode === 'sign-in' ? 'Sign in with email' : 'Create account'}
          </Button>
        </form>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}

        <Button
          variant="ghost"
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setError(null);
          }}
        >
          {mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </Button>
      </Paper>
    </main>
  );
}
