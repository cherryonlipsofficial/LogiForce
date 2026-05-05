import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api/authApi';
import PasswordStrengthBar from '../components/settings/PasswordStrengthBar';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const newPassword = watch('newPassword') || '';

  const onSubmit = async (data) => {
    if (data.newPassword !== data.confirmPassword) {
      setError('confirmPassword', { message: 'Passwords do not match' });
      return;
    }
    try {
      await resetPassword({ token, newPassword: data.newPassword });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      const msg = err.response?.data?.message || 'Unable to reset password. Please try again.';
      setError('root', { message: msg });
    }
  };

  const cardWrapperStyle = {
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
  const brandStyle = {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: '-0.5px',
    marginBottom: 4,
    background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };

  if (!token) {
    return (
      <div style={cardWrapperStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={brandStyle}>LogiForce</div>
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            textAlign: 'center',
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              color: '#f87171',
            }}>
              !
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>
                Invalid reset link
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 320, lineHeight: 1.6 }}>
                This password reset link is missing or malformed. Please request
                a new one.
              </p>
            </div>
            <Link
              to="/forgot-password"
              style={{
                fontSize: 13,
                color: 'var(--accent)',
                textDecoration: 'none',
                marginTop: 4,
              }}
            >
              Request a new reset link &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={cardWrapperStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={brandStyle}>LogiForce</div>
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            textAlign: 'center',
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(34,197,94,0.12)',
              border: '1px solid rgba(34,197,94,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              color: '#22c55e',
            }}>
              ✓
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>
                Password reset
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 320, lineHeight: 1.6 }}>
                Your password has been updated. Redirecting you to sign in&hellip;
              </p>
            </div>
            <Link
              to="/login"
              style={{
                fontSize: 13,
                color: 'var(--accent)',
                textDecoration: 'none',
              }}
            >
              Go to sign in &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={cardWrapperStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={brandStyle}>LogiForce</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            Choose a new password
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {errors.root && (
            <div style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
              color: '#f87171',
              marginBottom: 16,
            }}>
              {errors.root.message}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
              New password
            </label>
            <input
              type="password"
              {...register('newPassword', {
                required: 'New password is required',
                minLength: { value: 8, message: 'Password must be at least 8 characters' },
              })}
              placeholder="At least 8 characters"
              style={{ width: '100%', height: 40, fontSize: 13 }}
              autoComplete="new-password"
              autoFocus
            />
            <PasswordStrengthBar password={newPassword} />
            {errors.newPassword && (
              <span style={{ color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' }}>
                {errors.newPassword.message}
              </span>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
              Confirm new password
            </label>
            <input
              type="password"
              {...register('confirmPassword', {
                required: 'Please confirm your password',
              })}
              placeholder="Re-enter your new password"
              style={{ width: '100%', height: 40, fontSize: 13 }}
              autoComplete="new-password"
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
            {isSubmitting ? 'Resetting...' : 'Reset password'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Link
              to="/login"
              style={{
                fontSize: 12,
                color: 'var(--accent)',
                textDecoration: 'none',
              }}
            >
              &larr; Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
