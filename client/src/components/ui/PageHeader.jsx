import { useBreakpoint } from '../../hooks/useBreakpoint';

const PageHeader = ({ title, subtitle, action }) => {
  const { isMobile } = useBreakpoint();
  return (
  <div
    style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'flex-start' : 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
      gap: isMobile ? 10 : 0,
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
    {action && <div style={isMobile ? { width: '100%' } : undefined}>{action}</div>}
  </div>
  );
};

export default PageHeader;
