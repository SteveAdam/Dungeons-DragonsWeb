import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button, Input, Paper } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useAuth } from './authContext';
import styles from './SignInPage.module.css';

type Mode = 'sign-in' | 'sign-up';

/** Email and password sign-in and sign-up. */
export function SignInPage() {
  const { session } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/campaigns';
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (session) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const { data, error: authError } = mode === 'sign-in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (authError) {
      setError(mode === 'sign-in'
        ? 'That email and password do not match. Try again, or create an account.'
        : 'Could not create the account. Use a valid email and a password of at least 6 characters.');
      return;
    }
    if (mode === 'sign-up' && !data.session) setNotice('Check your email to confirm the account, then sign in.');
  }

  return (
    <main className={styles.page}>
      <Paper as="section" aria-labelledby="sign-in-title" className={styles.card}>
        <h1 id="sign-in-title" className={styles.title}>{mode === 'sign-in' ? 'Sign in' : 'Create an account'}</h1>
        <form onSubmit={onSubmit} className={styles.form}>
          <label htmlFor="email">Email</label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
          <label htmlFor="password">Password</label>
          <Input id="password" type="password" minLength={6} required
                 autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                 value={password} onChange={e => setPassword(e.target.value)} />
          <Button type="submit" disabled={busy}>
            {busy ? 'One moment…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </Button>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {notice && <p role="status" className={styles.notice}>{notice}</p>}
        </form>
        <Button variant="ghost" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError(null); }}>
          {mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </Button>
      </Paper>
    </main>
  );
}
