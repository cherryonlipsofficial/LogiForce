const SectionHeader = ({ title, action }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    }}
  >
    <div
      style={{
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--text3)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
      }}
    >
      {title}
    </div>
    {action}
  </div>
);

export default SectionHeader;
