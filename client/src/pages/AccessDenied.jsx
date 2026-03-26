import { useNavigate, useLocation } from 'react-router-dom';
import Btn from '../components/ui/Btn';

const AccessDenied = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const requiredPermission = location.state?.requiredPermission || null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: 40,
        textAlign: 'center',
      }}
    >
      <svg
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: 'var(--text3)', marginBottom: 20 }}
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Access denied</h1>
      <p style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 4, maxWidth: 400 }}>
        You do not have permission to access this page. Contact your administrator if you believe this is an error.
      </p>
      {requiredPermission && (
        <p style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 20 }}>
          Required: {requiredPermission}
        </p>
      )}
      <Btn variant="primary" onClick={() => navigate('/dashboard')}>
        Go to dashboard
      </Btn>
    </div>
  );
};

export default AccessDenied;
