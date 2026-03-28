import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useUserPrefs } from '../../hooks/useUserPrefs.jsx';
import { getPendingExtensions } from '../../api/guaranteeApi';

const mainNavItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '▦' },
  { path: '/drivers', label: 'Drivers', icon: '◈', permission: 'drivers.view' },
  { path: '/attendance', label: 'Attendance', icon: '◉', permission: 'attendance.view' },
  { path: '/salary', label: 'Salary runs', icon: '◎', permission: 'salary.view' },
  { path: '/invoices', label: 'Invoices', icon: '◳', permission: 'invoices.view' },
  { path: '/clients', label: 'Clients', icon: '◐', permission: 'clients.view' },
  { path: '/projects', label: 'Projects', icon: '◪', permission: 'projects.view' },
  { path: '/suppliers', label: 'Suppliers', icon: '◑', permission: 'suppliers.view' },
  { path: '/vehicles', label: 'Vehicles', icon: '◫', permission: 'vehicles.view' },
  { path: '/reports', label: 'Reports', icon: '▨', permission: 'reports.view' },
  { path: '/guarantee-passports', label: 'Guarantee passports', icon: '◎', permission: 'guarantee_passports.view' },
  { path: '/expired-documents', label: 'Expired documents', icon: '⚠', permission: 'expired_documents.view' },
];

const adminNavItems = [
  { path: '/users', label: 'Users', icon: '◎', permission: 'users.view' },
  { path: '/roles', label: 'Roles & access', icon: '◈', permission: 'roles.manage' },
  { path: '/guarantee-extensions', label: 'Guarantee approvals', icon: '◎', permission: 'roles.manage', hasBadge: true },
  { path: '/settings', label: 'Settings', icon: '⚙', permission: 'settings.view' },
];

const navLinkStyle = ({ isActive }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  background: isActive ? 'rgba(79,142,247,0.12)' : 'transparent',
  color: isActive ? 'var(--accent)' : 'var(--text2)',
  fontWeight: isActive ? 500 : 400,
  fontSize: 13,
  marginBottom: 2,
  textAlign: 'left',
  textDecoration: 'none',
  border: isActive ? '1px solid rgba(79,142,247,0.2)' : '1px solid transparent',
  transition: 'all .15s',
});

const NavItem = ({ item, badge }) => (
  <NavLink to={item.path} style={navLinkStyle}>
    <span style={{ fontSize: 15, width: 18, textAlign: 'center', flexShrink: 0 }}>
      {item.icon}
    </span>
    {item.label}
    {badge > 0 && (
      <span style={{
        background: '#ef4444', color: '#fff', borderRadius: 10,
        fontSize: 10, padding: '1px 6px', marginLeft: 'auto',
        lineHeight: '16px', fontWeight: 600,
      }}>
        {badge}
      </span>
    )}
  </NavLink>
);

const Sidebar = () => {
  const { user, role, logout, hasPermission } = useAuth();
  const { arabicNumerals, toggleArabicNumerals } = useUserPrefs();
  const isAdmin = hasPermission('roles.manage');

  const { data: pendingExtData } = useQuery({
    queryKey: ['pending-extensions'],
    queryFn: () => getPendingExtensions().then(r => {
      const d = r.data?.data || r.data || [];
      return Array.isArray(d) ? d : [];
    }),
    enabled: isAdmin,
    refetchInterval: 5 * 60 * 1000,
  });
  const pendingCount = pendingExtData?.length || 0;

  const visibleMain = mainNavItems.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  const visibleAdmin = adminNavItems.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  const roleName = user?.roleId?.displayName || role || 'User';

  return (
    <aside
      style={{
        width: 'var(--sidebar-w)',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
      }}
    >
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg,var(--accent),var(--accent2))',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            L
          </div>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 600, letterSpacing: '-0.3px' }}>
              LogiForce
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Workforce Platform
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div
          style={{
            background: 'rgba(79,142,247,0.12)',
            border: '1px solid rgba(79,142,247,0.25)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 11,
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
          {roleName.charAt(0).toUpperCase() + roleName.slice(1)} · {user?.name || 'User'}
        </div>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {visibleMain.map((item) => (
          <NavItem key={item.path} item={item} />
        ))}

        {visibleAdmin.length > 0 && (
          <>
            <div style={{ margin: '10px 10px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{
                fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase',
                letterSpacing: '0.07em', whiteSpace: 'nowrap',
              }}>
                Administration
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            {visibleAdmin.map((item) => (
              <NavItem key={item.path} item={item} badge={item.hasBadge ? pendingCount : 0} />
            ))}
          </>
        )}
      </nav>

      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={toggleArabicNumerals}
          style={{
            width: '100%',
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--border2)',
            background: arabicNumerals ? 'rgba(79,142,247,0.12)' : 'transparent',
            color: arabicNumerals ? 'var(--accent)' : 'var(--text3)',
            fontSize: 11,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Arabic numerals</span>
          <span>{arabicNumerals ? 'ON' : 'OFF'}</span>
        </button>
      </div>
      <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'var(--surface3)',
              border: '1px solid var(--border2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--accent)',
            }}
          >
            {user?.name?.split(' ').map((n) => n[0]).join('') || 'FD'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {user?.name || 'User'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>{roleName}</div>
          </div>
        </div>
        <button
          onClick={logout}
          style={{
            width: '100%',
            padding: '6px',
            borderRadius: 6,
            border: '1px solid var(--border2)',
            background: 'transparent',
            color: 'var(--text3)',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
