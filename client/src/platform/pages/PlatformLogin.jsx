import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { usePlatformAuth } from '../auth/platformAuthContext';
import { platformErrorMessage } from '../api/platformAxios';
import Btn from '../../components/ui/Btn';
import AuthCard from './AuthCard';
import { inputStyle, labelStyle, errorBox } from '../components/styles';

// Two steps: email + password, then the 6-digit code emailed to the user.
export default function PlatformLogin() {
  const { isAuthenticated, startLogin, verifyCode, resendCode } = usePlatformAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState(null); // { challengeToken, maskedEmail }
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const goTo = location.state?.from?.startsWith('/platform') ? location.state.from : '/platform/companies';
  if (isAuthenticated) return <Navigate to={goTo} replace />;

  const submitPassword = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await startLogin(email.trim(), password);
      setChallenge({ challengeToken: res.challengeToken, maskedEmail: res.maskedEmail });
      setPassword('');
    } catch (err) {
      setError(platformErrorMessage(err, 'Sign-in failed'));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await verifyCode(challenge.challengeToken, code.trim());
      navigate(goTo, { replace: true });
    } catch (err) {
      setError(platformErrorMessage(err, 'That code did not work'));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    try {
      await resendCode(challenge.challengeToken);
      toast.success('A new code is on its way');
    } catch (err) {
      setError(platformErrorMessage(err, 'Could not send a new code'));
    }
  };

  if (!challenge) {
    return (
      <AuthCard title="Sign in" subtitle="For LogiForce staff. Company users sign in at their company's address.">
        <form onSubmit={submitPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle} htmlFor="pf-email">Email</label>
            <input id="pf-email" type="email" autoComplete="username" required value={email}
              onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="pf-password">Password</label>
            <input id="pf-password" type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          </div>
          {error && <div style={errorBox}>{error}</div>}
          <Btn type="submit" variant="primary" disabled={busy || !email || !password}>
            {busy ? 'Checking…' : 'Continue'}
          </Btn>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Enter your code" subtitle={`We emailed a 6-digit code to ${challenge.maskedEmail || 'you'}.`}>
      <form onSubmit={submitCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle} htmlFor="pf-code">Code</label>
          <input id="pf-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ ...inputStyle, letterSpacing: '0.4em', fontFamily: 'var(--mono)', fontSize: 16 }} />
        </div>
        {error && <div style={errorBox}>{error}</div>}
        <Btn type="submit" variant="primary" disabled={busy || code.length !== 6}>
          {busy ? 'Verifying…' : 'Sign in'}
        </Btn>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <button type="button" onClick={resend} style={linkBtn}>Send a new code</button>
          <button type="button" onClick={() => { setChallenge(null); setCode(''); setError(''); }} style={linkBtn}>
            Start again
          </button>
        </div>
      </form>
    </AuthCard>
  );
}

const linkBtn = { background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: 12 };
