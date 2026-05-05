import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/authApi';

const ForgotPassword = () => {
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [devResetUrl, setDevResetUrl] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm();

  const onSubmit = async (data) => {
    try {
      const res = await forgotPassword(data.email);
      const payload = res.data?.data || {};
      setSubmittedEmail(data.email);
      if (payload.devResetUrl) setDevResetUrl(payload.devResetUrl);
      setSubmitted(true);
    } catch (err) {
      const msg = err.response?.data?.message || 'Unable to send reset link. Please try again.';
      setError('root', { message: msg });
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '40px 32px',
          margin: '0 12px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '-0.5px',
              marginBottom: 4,
              background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            LogiForce
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            {submitted ? '' : 'Reset your password'}
          </div>
        </div>

        {submitted ? (
          <div style={{
            display:       'flex',
            flexDirection: 'column',
            alignItems:    'center',
            textAlign:     'center',
            padding:       '0 0 8px',
            gap:           16,
          }}>
            <div style={{
              width:          64,
              height:         64,
              borderRadius:   '50%',
              background:     'rgba(34,197,94,0.12)',
              border:         '1px solid rgba(34,197,94,0.3)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       28,
              color:          '#22c55e',
            }}>
              ✓
            </div>

            <div>
              <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>
                Check your email
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 340, lineHeight: 1.6 }}>
                If an account exists for <strong>{submittedEmail}</strong>,
                we&rsquo;ve sent a password reset link. The link will expire in
                1 hour.
              </p>
            </div>

            {devResetUrl && (
              <div style={{
                background:   'rgba(99,102,241,0.08)',
                border:       '1px solid rgba(99,102,241,0.2)',
                borderRadius: 10,
                padding:      '12px 16px',
                maxWidth:     340,
                fontSize:     11,
                color:        'var(--text2)',
                textAlign:    'left',
                lineHeight:   1.6,
                wordBreak:    'break-all',
              }}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
                  Dev mode reset link:
                </div>
                <a href={devResetUrl} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                  {devResetUrl}
                </a>
              </div>
            )}

            <Link
              to="/login"
              style={{
                background:   'transparent',
                border:       'none',
                color:        'var(--accent)',
                fontSize:     13,
                cursor:       'pointer',
                marginTop:    8,
                textDecoration: 'none',
              }}
            >
              &larr; Back to sign in
            </Link>
          </div>
        ) : (
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

            <p style={{
              fontSize: 12,
              color: 'var(--text3)',
              marginBottom: 16,
              lineHeight: 1.6,
            }}>
              Enter the email address associated with your account and
              we&rsquo;ll send you a link to reset your password.
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Please enter a valid email address',
                  },
                })}
                placeholder="you@example.com"
                style={{ width: '100%', height: 40, fontSize: 13 }}
                autoComplete="email"
                autoFocus
              />
              {errors.email && (
                <span style={{ color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' }}>
                  {errors.email.message}
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
              {isSubmitting ? 'Sending...' : 'Send reset link'}
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
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
