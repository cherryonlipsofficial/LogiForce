const variantStyles = {
  ghost: {
    background: 'var(--surface3)',
    border: '1px solid var(--border2)',
    color: 'var(--text2)',
  },
  primary: {
    background: 'linear-gradient(135deg,var(--accent),var(--accent2))',
    border: 'none',
    color: '#fff',
  },
  danger: {
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.2)',
    color: '#f87171',
  },
  success: {
    background: 'rgba(34,197,94,0.12)',
    border: '1px solid rgba(34,197,94,0.2)',
    color: '#4ade80',
  },
};

const Btn = ({
  children,
  variant = 'ghost',
  onClick,
  style = {},
  small = false,
  type = 'button',
  disabled = false,
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    style={{
      borderRadius: 8,
      padding: small ? '5px 12px' : '7px 16px',
      fontSize: small ? 11 : 13,
      fontWeight: 500,
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all .15s',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      opacity: disabled ? 0.5 : 1,
      ...variantStyles[variant],
      ...style,
    }}
    onMouseEnter={(e) => {
      if (!disabled) e.currentTarget.style.opacity = '0.8';
    }}
    onMouseLeave={(e) => {
      if (!disabled) e.currentTarget.style.opacity = disabled ? '0.5' : '1';
    }}
  >
    {children}
  </button>
);

export default Btn;
