import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { forgotPassword } from '../api/authApi';

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

export default function ForgotPassword() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const onSubmit = async ({ email }) => {
    try {
      await forgotPassword(email);
    } catch (_) {
      // Backend always returns 200 to avoid enumeration; ignore network failures here too.
    }
    setSubmittedEmail(email);
    setSubmitted(true);
  };

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
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
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            {submitted ? 'Check your email' : 'Reset your password'}
          </div>
        </div>

        {submitted ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16 }}>
              If an account exists for <strong>{submittedEmail}</strong>, we've sent a link with
              instructions to reset the password. The link expires in one hour.
            </p>
            <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
              Didn't get an email? Check your spam folder, or contact your administrator if the
              account email is incorrect.
            </p>
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <Link to="/login" style={{ color: 'var(--accent)', fontSize: 13 }}>
                &larr; Back to sign in
              </Link>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 16 }}>
              Enter your account email and we'll send you a link to choose a new password.
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                {...register('email', { required: 'Email is required' })}
                placeholder="you@example.com"
                style={{ width: '100%', height: 40, fontSize: 13 }}
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

            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Link to="/login" style={{ color: 'var(--accent)', fontSize: 13 }}>
                &larr; Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
