import { useState, useRef, useEffect } from 'react';

const ROLE_COLORS = {
  admin:      { bg: 'rgba(124,95,240,0.15)', text: '#a78bfa' },
  accountant: { bg: 'rgba(29,179,136,0.15)',  text: '#4ade9a' },
  ops:        { bg: 'rgba(79,142,247,0.15)',  text: '#7eb3fc' },
  hr:         { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24' },
  viewer:     { bg: 'rgba(136,135,128,0.15)', text: 'var(--color-text-secondary)' },
};

function getRoleColor(roleName = '') {
  return ROLE_COLORS[roleName] || { bg: 'rgba(216,90,48,0.15)', text: '#fb8c6b' };
}

export default function RoleSelect({ value, onChange, roles = [], disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = roles.find(r => r._id === value);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => !disabled && setOpen(!open)}
        style={{
          height: 38,
          padding: '0 12px',
          border: '1px solid var(--border2)',
          borderRadius: 8,
          background: disabled ? 'var(--surface2)' : 'var(--surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 13,
          color: selected ? 'var(--text)' : 'var(--text3)',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span>{selected ? selected.displayName : 'Select a role...'}</span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>&#9662;</span>
      </div>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          zIndex: 50,
          background: 'var(--surface2)',
          border: '1px solid var(--border2)',
          borderRadius: 10,
          maxHeight: 240,
          overflowY: 'auto',
        }}>
          {roles.map(role => {
            const color = getRoleColor(role.name);
            const isSelected = role._id === value;
            return (
              <div
                key={role._id}
                onClick={() => { onChange(role._id); setOpen(false); }}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: color.text }}>
                    {role.displayName}
                  </div>
                  {role.description && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      {role.description}
                    </div>
                  )}
                </div>
                {isSelected && (
                  <span style={{ fontSize: 14, color: 'var(--accent)', marginLeft: 8, flexShrink: 0 }}>
                    &#10003;
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
