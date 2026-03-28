import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [accountInactive, setAccountInactive] = useState(false);
  const [inactiveEmail, setInactiveEmail] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm();

  const onSubmit = async (data) => {
    try {
      await login(data);
      navigate('/dashboard');
    } catch (err) {
      if (err.code === 'ACCOUNT_INACTIVE') {
        setAccountInactive(true);
        setInactiveEmail(data.email);
      } else {
        setError('root', { message: err.message });
      }
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
            {accountInactive ? '' : 'Sign in to your account'}
          </div>
        </div>

        {accountInactive ? (
          <div style={{
            display:       'flex',
            flexDirection: 'column',
            alignItems:    'center',
            textAlign:     'center',
            padding:       '0 0 8px',
            gap:           16,
          }}>
            {/* Lock icon */}
            <div style={{
              width:        64,
              height:       64,
              borderRadius: '50%',
              background:   'rgba(245,158,11,0.12)',
              border:       '1px solid rgba(245,158,11,0.3)',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              fontSize:     28,
            }}>
              ◎
            </div>

            <div>
              <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>
                Account pending activation
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 340, lineHeight: 1.6 }}>
                Your account (<strong>{inactiveEmail}</strong>) has been created
                but is not yet active. Please contact your administrator to
                activate your account before you can log in.
              </p>
            </div>

            {/* Info card */}
            <div style={{
              background:   'rgba(245,158,11,0.08)',
              border:       '1px solid rgba(245,158,11,0.2)',
              borderRadius: 10,
              padding:      '12px 16px',
              maxWidth:     340,
              fontSize:     12,
              color:        '#fbbf24',
              textAlign:    'left',
              lineHeight:   1.6,
            }}>
              Once your administrator activates your account, you can log
              in using this email and the password you were given.
            </div>

            {/* Back to login */}
            <button
              onClick={() => { setAccountInactive(false); setInactiveEmail(''); }}
              style={{
                background:   'transparent',
                border:       'none',
                color:        'var(--accent)',
                fontSize:     13,
                cursor:       'pointer',
                marginTop:    8,
              }}
            >
              &larr; Try a different account
            </button>
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
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                {...register('email', { required: 'Email is required' })}
                placeholder="admin@logiforce.ae"
                style={{ width: '100%', height: 40, fontSize: 13 }}
                autoComplete="email"
              />
              {errors.email && (
                <span style={{ color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' }}>
                  {errors.email.message}
                </span>
              )}
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                {...register('password', { required: 'Password is required' })}
                placeholder="Enter your password"
                style={{ width: '100%', height: 40, fontSize: 13 }}
                autoComplete="current-password"
              />
              {errors.password && (
                <span style={{ color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' }}>
                  {errors.password.message}
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
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
