import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PermissionGate from '../../components/ui/PermissionGate';
import UsersPanel from '../../components/settings/UsersPanel';
import RolesPanel from '../../components/settings/RolesPanel';

const tabs = [
  { id: 'users', label: 'Users', permission: 'users.view' },
  { id: 'roles', label: 'Roles & Permissions', permission: 'roles.manage' },
];

const Settings = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const getInitialTab = () => {
    if (location.pathname === '/roles') return 'roles';
    return 'users';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  useEffect(() => {
    if (location.pathname === '/roles') setActiveTab('roles');
    else if (location.pathname === '/users' || location.pathname === '/settings') setActiveTab('users');
  }, [location.pathname]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'users') navigate('/users', { replace: true });
    else if (tabId === 'roles') navigate('/roles', { replace: true });
  };

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - var(--topbar-h) - 48px)' }}>
      {/* Left mini-nav */}
      <div
        style={{
          width: 160,
          flexShrink: 0,
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          padding: '12px 8px',
          alignSelf: 'flex-start',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--text3)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '4px 10px 8px',
          }}
        >
          Settings
        </div>
        {tabs.map((tab) => (
          <PermissionGate key={tab.id} permission={tab.permission}>
            <button
              onClick={() => handleTabChange(tab.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 8,
                border: 'none',
                background: activeTab === tab.id ? 'rgba(79,142,247,0.12)' : 'transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text2)',
                fontWeight: activeTab === tab.id ? 500 : 400,
                fontSize: 13,
                cursor: 'pointer',
                marginBottom: 2,
                transition: 'all .15s',
              }}
            >
              {tab.label}
            </button>
          </PermissionGate>
        ))}
      </div>

      {/* Right content area */}
      <div style={{ flex: 1, marginLeft: 20 }}>
        {activeTab === 'users' && <UsersPanel />}
        {activeTab === 'roles' && <RolesPanel />}
      </div>
    </div>
  );
};

export default Settings;
