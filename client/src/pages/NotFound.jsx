import { Link } from 'react-router-dom';

const NotFound = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'var(--sans)',
      padding: 24,
      textAlign: 'center',
    }}
  >
    <div
      style={{
        fontSize: 72,
        fontWeight: 700,
        background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        letterSpacing: '-2px',
        lineHeight: 1,
        marginBottom: 12,
      }}
    >
      404
    </div>
    <h1 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 8px' }}>
      Page not found
    </h1>
    <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24, maxWidth: 400 }}>
      The page you're looking for doesn't exist or has been moved.
    </p>
    <Link
      to="/dashboard"
      style={{
        background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '10px 24px',
        fontSize: 13,
        fontWeight: 500,
        textDecoration: 'none',
      }}
    >
      Back to Dashboard
    </Link>
  </div>
);

export default NotFound;
