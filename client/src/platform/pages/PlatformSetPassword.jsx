import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { checkSetPasswordToken, setPlatformPassword } from '../api/platformApi';
import { platformErrorMessage } from '../api/platformAxios';
import Btn from '../../components/ui/Btn';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import AuthCard from './AuthCard';
import { inputStyle, labelStyle, errorBox, okBox } from '../components/styles';

const MIN_LENGTH = 12; // same rule as the server (PlatformUser MIN_PASSWORD_LENGTH)

// The page an invited platform user's set-password link opens.
export default function PlatformSetPassword() {
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const { data, isLoading, error: linkError } = useQuery({
    queryKey: ['platform', 'set-password', token],
    queryFn: () => checkSetPasswordToken(token),
    retry: false,
  });

  if (isLoading) return <LoadingSpinner style={{ minHeight: '100vh' }} />;

  if (linkError) {
    return (
      <AuthCard title="This link can't be used" subtitle={platformErrorMessage(linkError, 'The link is invalid or has expired.')}>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Ask a platform owner to send you a new one.</div>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password set">
        <div style={{ ...okBox, marginBottom: 14 }}>You can now sign in to the platform console.</div>
        <Link to="/platform/login" style={{ fontSize: 13, color: 'var(--accent)' }}>Go to sign in</Link>
      </AuthCard>
    );
  }

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await setPlatformPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not set the password'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Choose a password" subtitle={`For ${data?.email || 'your platform account'}. At least ${MIN_LENGTH} characters.`}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input type="email" autoComplete="username" value={data?.email || ''} readOnly hidden />
        <div>
          <label style={labelStyle} htmlFor="pf-new">New password</label>
          <input id="pf-new" type="password" autoComplete="new-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          {tooShort && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>At least {MIN_LENGTH} characters</div>}
        </div>
        <div>
          <label style={labelStyle} htmlFor="pf-confirm">Confirm password</label>
          <input id="pf-confirm" type="password" autoComplete="new-password" required value={confirm}
            onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
          {mismatch && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>Passwords don&apos;t match</div>}
        </div>
        {error && <div style={errorBox}>{error}</div>}
        <Btn type="submit" variant="primary" disabled={busy || password.length < MIN_LENGTH || confirm !== password}>
          {busy ? 'Saving…' : 'Set password'}
        </Btn>
      </form>
    </AuthCard>
  );
}
