import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { sendOtp, verifyOtp } from '../api/authApi';
import toast from 'react-hot-toast';

const wrapperStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg)',
};

const cardStyle = {
  width: '100%',
  maxWidth: 400,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '40px 32px',
  margin: '0 12px',
};

const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 };
const errorStyle = { color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' };

const PURPOSE_COPY = {
  verify_email:   { title: 'Verify your email',  cta: 'Verify email',     successHint: 'Email verified.' },
  password_reset: { title: 'Set a new password', cta: 'Set new password', successHint: 'Password updated.' },
  login:          { title: 'Sign in with code',  cta: 'Sign in',          successHint: 'Signed in.' },
};

export default function VerifyOtp() {
  const navigate = useNavigate();
  const location = useLocation();
  const initial = location.state || {};

  const [email, setEmail] = useState(initial.email || '');
  const [purpose] = useState(initial.purpose || 'verify_email');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef(null);

  const copy = PURPOSE_COPY[purpose] || PURPOSE_COPY.verify_email;
  const requiresPassword = purpose === 'password_reset';

  useEffect(() => {
    if (!email) {
      // No email in route state — fall back to the entry point for the purpose.
      navigate(purpose === 'password_reset' ? '/forgot-password' : '/register', { replace: true });
    }
  }, [email, purpose, navigate]);

  useEffect(() => () => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
  }, []);

  const startCooldown = () => {
    setResendCooldown(30);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) { clearInterval(cooldownRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await sendOtp({ email, purpose });
      toast.success('A new code has been sent.');
      startCooldown();
    } catch {
      toast.error('Could not resend the code. Please try again.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    if (requiresPassword && password.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await verifyOtp({
        email,
        code,
        purpose,
        password: requiresPassword ? password : undefined,
      });

      if (purpose === 'login' && res?.data?.token) {
        localStorage.setItem('token', res.data.token);
        toast.success(copy.successHint);
        // Hard-navigate so AuthProvider rehydrates from /auth/me with the new token.
        window.location.href = '/dashboard';
        return;
      }

      toast.success(copy.successHint);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '-0.5px',
            marginBottom: 4,
            background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>LogiForce</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>{copy.title}</div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 18 }}>
          We sent a 6-digit code to <strong style={{ color: 'var(--text)' }}>{email}</strong>.
          The code expires in 10 minutes.
        </p>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
              color: '#f87171',
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Verification code</label>
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              autoComplete="one-time-code"
              style={{
                width: '100%',
                height: 48,
                fontSize: 22,
                letterSpacing: 12,
                textAlign: 'center',
                fontFamily: "'SF Mono', Menlo, Consolas, monospace",
              }}
            />
          </div>

          {requiresPassword && (
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                style={{ width: '100%', height: 40, fontSize: 13 }}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              height: 42,
              background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Verifying...' : copy.cta}
          </button>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              style={{
                background: 'transparent',
                border: 'none',
                color: resendCooldown > 0 ? 'var(--text3)' : 'var(--accent)',
                fontSize: 12,
                cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>

          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Link to="/login" style={{ color: 'var(--text3)', fontSize: 12 }}>
              &larr; Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
