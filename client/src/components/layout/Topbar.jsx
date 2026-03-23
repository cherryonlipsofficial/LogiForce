import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { useSyncTime } from '../../hooks/useSyncTime.jsx';

const pageTitles = {
  dashboard: 'Finance overview',
  drivers: 'Driver management',
  attendance: 'Attendance processing',
  salary: 'Salary runs',
  invoices: 'Invoice management',
  clients: 'Client management',
  suppliers: 'Supplier management',
  reports: 'Reports & analytics',
};

const Topbar = ({ page }) => {
  const { user } = useAuth();
  const searchRef = useRef(null);
  const lastSynced = useSyncTime();

  // Cmd/Ctrl+K shortcut to focus search
  const handleKeyDown = useCallback((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      searchRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      style={{
        height: 'var(--topbar-h)',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        position: 'fixed',
        top: 0,
        left: 'var(--sidebar-w)',
        right: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 16,
      }}
    >
      <div style={{ flex: 1 }}>
        <h1
          style={{
            fontSize: 15,
            fontWeight: 500,
            letterSpacing: '-0.2px',
            margin: 0,
          }}
        >
          {pageTitles[page] || page}
        </h1>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
          March 2026 · UAE/GCC Operations
        </div>
      </div>
      <div style={{ position: 'relative', width: 220 }}>
        <input
          ref={searchRef}
          placeholder="Search drivers, invoices..."
          style={{ paddingLeft: 32, paddingRight: 40, fontSize: 12, height: 34, width: '100%' }}
        />
        <span
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text3)',
            fontSize: 13,
            pointerEvents: 'none',
          }}
        >
          &#x2315;
        </span>
        <span
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text3)',
            fontSize: 10,
            pointerEvents: 'none',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '1px 5px',
            fontFamily: 'var(--mono)',
          }}
        >
          ⌘K
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {lastSynced && (
          <span
            style={{
              fontSize: 10,
              color: 'var(--text3)',
              whiteSpace: 'nowrap',
            }}
            title={`Last synced: ${lastSynced.toLocaleTimeString()}`}
          >
            Synced {formatTimeSince(lastSynced)}
          </span>
        )}
        <button
          style={{
            background: 'rgba(239,68,68,0.12)',
            color: '#ef6060',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          9 alerts
        </button>
        <button
          style={{
            background:
              'linear-gradient(135deg,var(--accent),var(--accent2))',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '7px 16px',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          + Run payroll
        </button>
      </div>
    </div>
  );
};

function formatTimeSince(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default Topbar;
