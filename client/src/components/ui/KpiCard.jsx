const KpiCard = ({ label, value, sub, color }) => (
  <div
    style={{
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 18px',
    }}
  >
    <div
      style={{
        fontSize: 11,
        color: 'var(--text3)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 8,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 22,
        fontWeight: 600,
        color: color || 'var(--text)',
        letterSpacing: '-0.5px',
        marginBottom: sub ? 4 : 0,
      }}
    >
      {value}
    </div>
    {sub && (
      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</div>
    )}
  </div>
);

export default KpiCard;
