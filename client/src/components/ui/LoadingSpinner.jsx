const LoadingSpinner = ({ size = 32, style = {} }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      ...style,
    }}
  >
    <div
      style={{
        width: size,
        height: size,
        border: '3px solid var(--border2)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.6s linear infinite',
      }}
    />
  </div>
);

export default LoadingSpinner;
