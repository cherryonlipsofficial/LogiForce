// An on/off switch. `disabled` greys it out and ignores clicks.
export default function Toggle({ on, onChange, disabled = false, label, size = 'normal' }) {
  const w = size === 'small' ? 32 : 36;
  const h = size === 'small' ? 18 : 20;
  const dot = h - 4;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!on)}
      style={{
        width: w, height: h, borderRadius: h, flexShrink: 0,
        background: on ? '#4f8ef7' : 'var(--surface3)',
        border: 'none', padding: 2, position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1, transition: 'background .15s',
      }}
    >
      <div style={{
        width: dot, height: dot, borderRadius: '50%', background: '#fff',
        transition: 'transform .15s',
        transform: on ? `translateX(${w - dot - 4}px)` : 'translateX(0)',
      }} />
    </button>
  );
}
