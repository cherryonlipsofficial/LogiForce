const Card = ({ children, style = {}, className = '' }) => (
  <div
    className={className}
    style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      ...style,
    }}
  >
    {children}
  </div>
);

export default Card;
