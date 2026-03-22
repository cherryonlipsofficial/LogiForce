import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊', roles: null },
  { path: '/drivers', label: 'Drivers', icon: '🚛', roles: null },
  { path: '/attendance', label: 'Attendance', icon: '📋', roles: ['admin', 'ops'] },
  { path: '/salary', label: 'Salary', icon: '💰', roles: ['admin', 'accountant'] },
  { path: '/invoices', label: 'Invoices', icon: '🧾', roles: ['admin', 'accountant'] },
  { path: '/clients', label: 'Clients', icon: '🤝', roles: ['admin', 'accountant'] },
  { path: '/suppliers', label: 'Suppliers', icon: '📦', roles: ['admin'] },
  { path: '/reports', label: 'Reports', icon: '📈', roles: null },
];

const Sidebar = () => {
  const { user, role, logout } = useAuth();

  const visibleItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(role)
  );

  return (
    <aside style={styles.sidebar}>
      <div style={styles.logo}>
        <span style={styles.logoText}>LogiForce</span>
      </div>

      <nav style={styles.nav}>
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              ...styles.navLink,
              ...(isActive ? styles.navLinkActive : {}),
            })}
          >
            <span style={styles.icon}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div style={styles.userSection}>
        <div style={styles.userInfo}>
          <div style={styles.avatar}>
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div style={styles.userDetails}>
            <span style={styles.userName}>{user?.name || 'User'}</span>
            <span style={styles.userRole}>{role}</span>
          </div>
        </div>
        <button onClick={logout} style={styles.logoutBtn}>
          Logout
        </button>
      </div>
    </aside>
  );
};

const styles = {
  sidebar: {
    width: '240px',
    minHeight: '100vh',
    background: '#1a1a2e',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 100,
  },
  logo: {
    padding: '24px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  logoText: {
    fontSize: '22px',
    fontWeight: 700,
    letterSpacing: '-0.5px',
    color: '#c084fc',
  },
  nav: {
    flex: 1,
    padding: '12px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    overflowY: 'auto',
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    borderRadius: '8px',
    color: 'rgba(255,255,255,0.65)',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'background 0.15s, color 0.15s',
  },
  navLinkActive: {
    background: 'rgba(192, 132, 252, 0.2)',
    color: '#c084fc',
  },
  icon: {
    fontSize: '18px',
  },
  userSection: {
    padding: '16px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '12px',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: '#c084fc',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '14px',
  },
  userDetails: {
    display: 'flex',
    flexDirection: 'column',
  },
  userName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#fff',
  },
  userRole: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'capitalize',
  },
  logoutBtn: {
    width: '100%',
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
};

export default Sidebar;
