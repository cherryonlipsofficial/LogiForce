const variants = {
  default: { background: 'var(--surface3)', color: 'var(--text2)' },
  success: {
    background: 'rgba(34,197,94,0.12)',
    color: '#4ade80',
    border: '1px solid rgba(34,197,94,0.2)',
  },
  warning: {
    background: 'rgba(245,158,11,0.12)',
    color: '#fbbf24',
    border: '1px solid rgba(245,158,11,0.2)',
  },
  danger: {
    background: 'rgba(239,68,68,0.12)',
    color: '#f87171',
    border: '1px solid rgba(239,68,68,0.2)',
  },
  info: {
    background: 'rgba(79,142,247,0.12)',
    color: '#7eb3fc',
    border: '1px solid rgba(79,142,247,0.2)',
  },
  purple: {
    background: 'rgba(124,95,240,0.12)',
    color: '#a78bfa',
    border: '1px solid rgba(124,95,240,0.2)',
  },
};

const Badge = ({ children, variant = 'default', style = {} }) => (
  <span
    style={{
      fontSize: 11,
      fontWeight: 500,
      padding: '3px 8px',
      borderRadius: 6,
      display: 'inline-block',
      whiteSpace: 'nowrap',
      ...variants[variant],
      ...style,
    }}
  >
    {children}
  </span>
);

export default Badge;
