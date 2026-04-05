import React from 'react';

const ReportTabs = ({ tabs, activeTab, onTabChange, visibleTabs = [] }) => {
  const filtered = tabs.filter(t => visibleTabs.includes(t.id));
  if (filtered.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
      {filtered.map(tab => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              padding: '9px 16px',
              borderRadius: '8px 8px 0 0',
              border: isActive ? '1px solid var(--border)' : '1px solid transparent',
              borderBottom: isActive ? '1px solid var(--surface)' : '1px solid transparent',
              background: isActive ? 'var(--surface)' : 'transparent',
              color: isActive ? 'var(--accent)' : 'var(--text3)',
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all .15s',
              marginBottom: isActive ? -1 : 0,
              position: 'relative',
            }}
          >
            <span style={{ fontSize: 14 }}>{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default ReportTabs;
