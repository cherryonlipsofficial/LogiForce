const PageHeader = ({ title, subtitle, action }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    }}
  >
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px', marginBottom: 2 }}>
        {title}
      </h1>
      {subtitle && (
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{subtitle}</div>
      )}
    </div>
    {action && <div>{action}</div>}
  </div>
);

export default PageHeader;
