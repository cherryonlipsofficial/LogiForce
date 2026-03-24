import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useUserPrefs } from '../../hooks/useUserPrefs.jsx';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '▦', roles: null },
  { path: '/drivers', label: 'Drivers', icon: '◈', roles: null },
  { path: '/attendance', label: 'Attendance', icon: '◉', roles: ['admin', 'ops'] },
  { path: '/salary', label: 'Salary runs', icon: '◎', roles: ['admin', 'accountant'] },
  { path: '/invoices', label: 'Invoices', icon: '◳', roles: ['admin', 'accountant'] },
  { path: '/clients', label: 'Clients', icon: '◐', roles: ['admin', 'accountant'] },
  { path: '/suppliers', label: 'Suppliers', icon: '◑', roles: ['admin'] },
  { path: '/vehicles', label: 'Vehicles', icon: '◧', roles: ['admin', 'ops'] },
  { path: '/reports', label: 'Reports', icon: '◫', roles: null },
];

const Sidebar = () => {
  const { user, role, logout } = useAuth();
  const { arabicNumerals, toggleArabicNumerals } = useUserPrefs();

  const visibleItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(role)
  );

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
          {role ? `${role.charAt(0).toUpperCase() + role.slice(1)}` : 'Admin'} · {user?.name || 'Finance Director'}
        </div>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {visibleItems.map((item, i) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
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
              animation: `slideIn 0.2s ease ${i * 0.04}s both`,
            })}
          >
            <span style={{ fontSize: 15, width: 18, textAlign: 'center', flexShrink: 0 }}>
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
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
              {user?.name || 'Finance Director'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>LogiForce Admin</div>
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
