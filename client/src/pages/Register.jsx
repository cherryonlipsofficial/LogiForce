import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { registerWithOtp } from '../api/authApi';
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
  maxWidth: 380,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '40px 32px',
  margin: '0 12px',
};

const inputStyle = { width: '100%', height: 40, fontSize: 13 };
const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 };
const errorStyle = { color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' };

export default function Register() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();

  const onSubmit = async ({ name, email, password }) => {
    setServerError('');
    try {
      await registerWithOtp({ name, email, password });
      toast.success('Verification code sent to your email');
      navigate('/verify-otp', {
        state: { email, purpose: 'verify_email' },
      });
    } catch (err) {
      setServerError(err.response?.data?.message || 'Could not create your account.');
    }
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
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Create your account</div>
        </div>

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

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Full name</label>
            <input
              {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Name must be at least 2 characters' } })}
              placeholder="Your name"
              style={inputStyle}
              autoComplete="name"
            />
            {errors.name && <span style={errorStyle}>{errors.name.message}</span>}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
              })}
              placeholder="you@example.com"
              style={inputStyle}
              autoComplete="email"
            />
            {errors.email && <span style={errorStyle}>{errors.email.message}</span>}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'At least 8 characters' },
              })}
              placeholder="At least 8 characters"
              style={inputStyle}
              autoComplete="new-password"
            />
            {errors.password && <span style={errorStyle}>{errors.password.message}</span>}
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
            {isSubmitting ? 'Sending code...' : 'Create account'}
          </button>

          <p style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, marginTop: 14, textAlign: 'center' }}>
            We'll email a 6-digit code to verify your address.
            An administrator activates the account before first sign-in.
          </p>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link to="/login" style={{ color: 'var(--accent)', fontSize: 13 }}>
              &larr; Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
