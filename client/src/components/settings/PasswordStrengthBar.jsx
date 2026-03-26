export default function PasswordStrengthBar({ password = '' }) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) score++;

  const colors = ['#9ca3af', '#ef4444', '#f59e0b', '#eab308', '#22c55e'];
  const labels = ['', 'Too short', 'Could be stronger', 'Almost there', 'Strong password \u2713'];

  const getSegmentColor = (index) => {
    if (score === 0) return '#9ca3af';
    if (index < score) return colors[score];
    return '#9ca3af';
  };

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: getSegmentColor(i),
              transition: 'background 0.2s ease',
            }}
          />
        ))}
      </div>
      {password.length > 0 && labels[score] && (
        <div style={{
          fontSize: 10,
          marginTop: 4,
          color: score === 4 ? '#22c55e' : 'var(--text3)',
        }}>
          {labels[score]}
        </div>
      )}
    </div>
  );
}
