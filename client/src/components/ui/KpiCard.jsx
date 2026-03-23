import { useUserPrefs } from '../../hooks/useUserPrefs.jsx';

const easternArabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

function toArabicNumerals(str) {
  return String(str).replace(/\d/g, (d) => easternArabicDigits[parseInt(d)]);
}

const KpiCard = ({ label, value, sub, color }) => {
  const { arabicNumerals } = useUserPrefs();
  const displayValue = arabicNumerals ? toArabicNumerals(value) : value;

  return (
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
        {displayValue}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</div>
      )}
    </div>
  );
};

export default KpiCard;
