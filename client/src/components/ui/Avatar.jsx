const Avatar = ({ initials, size = 34 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'rgba(79,142,247,0.15)',
      border: '1px solid rgba(79,142,247,0.25)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.35,
      fontWeight: 500,
      color: 'var(--accent)',
      flexShrink: 0,
    }}
  >
    {initials}
  </div>
);

export default Avatar;
