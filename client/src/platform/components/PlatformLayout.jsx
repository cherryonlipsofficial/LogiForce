import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { usePlatformAuth } from '../auth/platformAuthContext';
import { usePlatformCan } from '../hooks/usePlatformPermission';
import { NAV } from './nav';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import Badge from '../../components/ui/Badge';


export default function PlatformLayout() {
  const { user, logout } = usePlatformAuth();
  const can = usePlatformCan();
  const nav = NAV.filter((item) => item.any.some(can));
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();

  const signOut = () => {
    logout();
    navigate('/platform/login', { replace: true });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: isMobile ? 'column' : 'row', background: 'var(--bg)' }}>
      <aside style={{
        width: isMobile ? '100%' : 220, flexShrink: 0, background: 'var(--surface)',
        borderRight: isMobile ? 'none' : '1px solid var(--border)',
        borderBottom: isMobile ? '1px solid var(--border)' : 'none',
        display: 'flex', flexDirection: isMobile ? 'row' : 'column',
        alignItems: isMobile ? 'center' : 'stretch', gap: isMobile ? 4 : 0,
        padding: isMobile ? '8px 12px' : '18px 12px', overflowX: isMobile ? 'auto' : 'visible',
      }}>
        {!isMobile && (
          <div style={{ padding: '0 8px 18px' }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 600 }}>LogiForce</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Platform console</div>
          </div>
        )}
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              borderRadius: 8, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap',
              color: isActive ? 'var(--text)' : 'var(--text2)',
              background: isActive ? 'rgba(79,142,247,0.12)' : 'transparent',
              marginBottom: isMobile ? 0 : 2,
            })}
          >
            <span style={{ width: 16, textAlign: 'center', color: 'var(--text3)' }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{
          padding: isMobile ? '0 0 0 8px' : '12px 8px 0', borderTop: isMobile ? 'none' : '1px solid var(--border)',
          display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: 6, alignItems: isMobile ? 'center' : 'flex-start',
        }}>
          {!isMobile && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text)', wordBreak: 'break-all' }}>{user?.email}</div>
              <Badge variant={user?.roleKey === 'platform_owner' ? 'purple' : 'default'}>{user?.roleName || user?.roleKey}</Badge>
            </>
          )}
          <button
            type="button"
            onClick={signOut}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--text3)', fontSize: 12, marginTop: isMobile ? 0 : 4, whiteSpace: 'nowrap',
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, padding: isMobile ? 16 : '24px 28px' }}>
        <Outlet />
      </main>
    </div>
  );
}
