// Centered card used by the console's sign-in and set-password pages.
export default function AuthCard({ title, subtitle, children }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 380, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '28px 24px',
      }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 600 }}>LogiForce</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 20 }}>Platform console</div>
        <h1 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{title}</h1>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18, lineHeight: 1.5 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}
