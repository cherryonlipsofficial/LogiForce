const EmptyState = ({ icon = '📭', title = 'No data', message, action }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      color: 'var(--text3)',
    }}
  >
    <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
    <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text2)', marginBottom: 4 }}>
      {title}
    </div>
    {message && <div style={{ fontSize: 13, marginBottom: 16 }}>{message}</div>}
    {action}
  </div>
);

export default EmptyState;
