import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { verifyResetToken, resetPassword } from '../api/authApi';

const wrapperStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg)',
};

const cardStyle = {
  width: '100%',
  maxWidth: 380,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '40px 32px',
  margin: '0 12px',
};

const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 };
const inputStyle = { width: '100%', height: 40, fontSize: 13 };

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm();

  const [status, setStatus] = useState('verifying'); // verifying | valid | invalid | done
  const [accountInfo, setAccountInfo] = useState(null);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await verifyResetToken(token);
        if (cancelled) return;
        setAccountInfo(res?.data || null);
        setStatus('valid');
      } catch (err) {
        if (cancelled) return;
        setServerError(err?.response?.data?.message || 'This reset link is invalid or has expired');
        setStatus('invalid');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const onSubmit = async ({ password, confirmPassword }) => {
    setServerError('');
    if (password !== confirmPassword) {
      setServerError('Passwords do not match');
      return;
    }
    try {
      await resetPassword(token, password);
      toast.success('Password reset successful. You can now sign in.');
      setStatus('done');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setServerError(err?.response?.data?.message || 'Could not reset password');
    }
  };

  const renderHeader = (subtitle) => (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <div style={{
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: '-0.5px',
        marginBottom: 4,
        background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>LogiForce</div>
      <div style={{ fontSize: 13, color: 'var(--text3)' }}>{subtitle}</div>
    </div>
  );

  if (status === 'verifying') {
    return (
      <div style={wrapperStyle}>
        <div style={cardStyle}>
          {renderHeader('Verifying reset link...')}
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text2)' }}>
            One moment.
          </div>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div style={wrapperStyle}>
        <div style={cardStyle}>
          {renderHeader('Reset link unavailable')}
          <div style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 12,
            color: '#f87171',
            marginBottom: 16,
            lineHeight: 1.6,
          }}>
            {serverError}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            Reset links expire after one hour. Ask your administrator to send a new one,
            or request a fresh link from the login page.
          </p>
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <Link to="/login" style={{ color: 'var(--accent)', fontSize: 13 }}>
              &larr; Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div style={wrapperStyle}>
        <div style={cardStyle}>
          {renderHeader('Password updated')}
          <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.6 }}>
            Redirecting you to sign in...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
        {renderHeader(accountInfo?.email ? `Choose a new password for ${accountInfo.email}` : 'Choose a new password')}

        <form onSubmit={handleSubmit(onSubmit)}>
          {serverError && (
            <div style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
              color: '#f87171',
              marginBottom: 16,
            }}>
              {serverError}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>New password</label>
            <input
              type="password"
              autoComplete="new-password"
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'Password must be at least 8 characters' },
              })}
              style={inputStyle}
            />
            {errors.password && (
              <span style={{ color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' }}>
                {errors.password.message}
              </span>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Confirm password</label>
            <input
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword', {
                required: 'Please confirm your password',
                validate: (v) => v === watch('password') || 'Passwords do not match',
              })}
              style={inputStyle}
            />
            {errors.confirmPassword && (
              <span style={{ color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' }}>
                {errors.confirmPassword.message}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              height: 42,
              background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.6 : 1,
              transition: 'opacity .15s',
            }}
          >
            {isSubmitting ? 'Updating...' : 'Update password'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <Link to="/login" style={{ color: 'var(--accent)', fontSize: 13 }}>
            &larr; Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
