import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useSyncTime } from '../../hooks/useSyncTime.jsx';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useUserPrefs } from '../../hooks/useUserPrefs';
import toast from 'react-hot-toast';
import axiosInstance from '../../api/axiosInstance';
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead, getPendingApprovals } from '../../api/notificationsApi';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import PermissionGate from '../ui/PermissionGate';
import NotificationPanel from './NotificationPanel';

const pageTitles = {
  dashboard: 'Finance overview',
  drivers: 'Driver management',
  attendance: 'Attendance processing',
  salary: 'Salary runs',
  invoices: 'Invoice management',
  advances: 'Advance management',
  clients: 'Client management',
  suppliers: 'Supplier management',
  reports: 'Reports & analytics',
  settings: 'Settings',
  users: 'Settings',
  roles: 'Settings',
  profile: 'Your profile',
  notifications: 'Notifications',
};

/* ── My Permissions Modal ── */
const MyPermissionsModal = ({ onClose }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['my-permissions'],
    queryFn: () => axiosInstance.get('/auth/permissions').then((r) => r.data.data),
  });

  const perms = data?.permissions || [];
  const role = data?.role || {};
  const [collapsed, setCollapsed] = useState({});

  // Group permissions by module (using the key prefix)
  const grouped = {};
  perms.forEach((key) => {
    const mod = key.split('.')[0];
    if (!grouped[mod]) grouped[mod] = [];
    grouped[mod].push(key);
  });

  return (
    <Modal title="Your access permissions" width={500} onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.5 }}>
        Role: <strong style={{ color: 'var(--text)' }}>{role.displayName || role.name || '—'}</strong>{' '}
        · {perms.length} permissions granted
      </div>

      {isLoading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
      ) : (
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {Object.keys(grouped).sort().map((mod) => {
            const isCollapsed = collapsed[mod];
            return (
              <div key={mod} style={{ marginBottom: 4 }}>
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [mod]: !c[mod] }))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--surface2)',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    minHeight: 'auto',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--text3)',
                      transition: 'transform .15s',
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    }}
                  >
                    ▼
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{mod}</span>
                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>{grouped[mod].length}</span>
                </button>
                {!isCollapsed &&
                  grouped[mod].sort().map((key) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 12px 6px 32px',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <span style={{ color: '#4ade80', fontSize: 12 }}>✓</span>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{key}</span>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 16, lineHeight: 1.5 }}>
        Need additional access? Contact your system administrator.
      </div>
    </Modal>
  );
};

/* ── Change Password Modal ── */
const ChangePasswordModal = ({ onClose }) => {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border2)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text2)',
    marginBottom: 4,
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.currentPassword || !form.newPassword) {
      setError('All fields are required');
      return;
    }
    if (form.newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await axiosInstance.put('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      toast.success('Password changed successfully');
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Change password" width={400} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Current password</label>
          <input
            style={inputStyle}
            type="password"
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>New password</label>
          <input
            style={inputStyle}
            type="password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Confirm new password</label>
          <input
            style={inputStyle}
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          />
        </div>
        {error && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{error}</div>}
        <Btn variant="primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
          {loading ? 'Changing...' : 'Change password'}
        </Btn>
      </form>
    </Modal>
  );
};

/* ── Topbar ── */
const Topbar = ({ page, onMenuToggle, showMenuButton }) => {
  const { user, logout, role, hasPermission, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const searchRef = useRef(null);
  const lastSynced = useSyncTime();
  const { isMobile, isTablet } = useBreakpoint();
  const { theme, setTheme } = useUserPrefs();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifPage, setNotifPage] = useState(1);
  const menuRef = useRef(null);

  // Poll unread count every 30 seconds
  const { data: countData } = useQuery({
    queryKey: ['notif-unread-count'],
    queryFn: () => getUnreadCount().then(r => r.data),
    refetchInterval: 30000,
    enabled: isAuthenticated,
  });
  const unreadCount = countData?.count || 0;

  // Fetch notifications when panel opens
  const { data: notifData, isLoading: notifLoading } = useQuery({
    queryKey: ['notifications', notifPage],
    queryFn: () => getNotifications(notifPage).then(r => r.data),
    enabled: notifOpen,
  });
  const notifications = notifData?.notifications || [];

  // Close notification panel on click outside
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e) => {
      if (!e.target.closest('.notif-panel-container')) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  const roleName = user?.roleId?.displayName || role || 'User';

  // Pending approvals count
  const { data: pendingApprovalsData } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: () => getPendingApprovals().then(r => r.data?.data || r.data || {}),
    refetchInterval: 60000,
    enabled: isAuthenticated,
  });
  const pendingApprovalCount = pendingApprovalsData?.total || 0;
  const pendingItems = pendingApprovalsData?.items || [];

  const { data: alertData } = useQuery({
    queryKey: ['alert-count'],
    queryFn: () => axiosInstance.get('/reports/alert-count').then((r) => r.data?.data || { total: 0 }),
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });
  const alertCount = alertData?.total ?? 0;

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

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U';

  return (
    <>
      <div
        style={{
          height: 'var(--topbar-h)',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          position: 'fixed',
          top: 0,
          left: showMenuButton ? 0 : 'var(--sidebar-w)',
          right: 0,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          padding: isMobile ? '0 12px' : '0 24px',
          gap: isMobile ? 8 : 16,
        }}
      >
        {/* Hamburger menu button for mobile/tablet */}
        {showMenuButton && (
          <button
            onClick={onMenuToggle}
            style={{
              background: 'var(--surface3)',
              border: '1px solid var(--border2)',
              color: 'var(--text)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 18,
              cursor: 'pointer',
              flexShrink: 0,
              minHeight: 'auto',
              lineHeight: 1,
            }}
          >
            ☰
          </button>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              fontSize: isMobile ? 14 : 15,
              fontWeight: 500,
              letterSpacing: '-0.2px',
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {pageTitles[page] || page}
          </h1>
          {!isMobile && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
              March 2026 · UAE/GCC Operations
            </div>
          )}
        </div>

        {/* Search bar: hidden on mobile, flexible on tablet, fixed on desktop */}
        {!isMobile && (
          <div style={{ position: 'relative', width: isTablet ? undefined : 220, flex: isTablet ? 1 : undefined, maxWidth: isTablet ? 280 : undefined }}>
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
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8, flexShrink: 0 }}>
          {/* Synced time - hidden on mobile */}
          {!isMobile && lastSynced && (
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

          {/* Pending approvals button - hidden on mobile */}
          {!isMobile && pendingApprovalCount > 0 && (
            <button
              onClick={() => {
                // Navigate to the first pending approval type
                if (pendingItems.length > 0) navigate(pendingItems[0].path);
              }}
              title={pendingItems.map(i => `${i.count} ${i.label}`).join(', ')}
              style={{
                background: 'rgba(245,158,11,0.12)',
                color: '#d97706',
                border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                minHeight: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                animation: pendingApprovalCount > 0 ? 'pendingPulse 2s ease-in-out infinite' : 'none',
              }}
            >
              <span style={{ fontSize: 13 }}>⚡</span>
              {pendingApprovalCount} pending
            </button>
          )}

          {/* Alert button - hidden on mobile */}
          {!isMobile && (
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                background: alertCount > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(74,222,128,0.12)',
                color: alertCount > 0 ? '#ef6060' : '#4ade80',
                border: `1px solid ${alertCount > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(74,222,128,0.2)'}`,
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                minHeight: 'auto',
              }}
            >
              {alertCount} {alertCount === 1 ? 'alert' : 'alerts'}
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'var(--surface3)',
              border: '1px solid var(--border2)',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 16,
              cursor: 'pointer',
              color: 'var(--text2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 'auto',
              lineHeight: 1,
            }}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          {/* Notification bell - always visible */}
          <div className="notif-panel-container" style={{ position: 'relative' }}>
            <button
              onClick={() => setNotifOpen(o => !o)}
              style={{
                background: 'var(--surface3)',
                border: '1px solid var(--border2)',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 16,
                cursor: 'pointer',
                color: 'var(--text2)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                minHeight: 'auto',
              }}
            >
              ◎
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  background: '#ef4444',
                  color: '#fff',
                  borderRadius: 10,
                  fontSize: 10,
                  fontWeight: 500,
                  padding: '1px 5px',
                  minWidth: 16,
                  textAlign: 'center',
                  lineHeight: '14px',
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <NotificationPanel
                notifications={notifications}
                isLoading={notifLoading}
                unreadCount={unreadCount}
                onClose={() => setNotifOpen(false)}
                isMobile={isMobile}
                onMarkAllRead={async () => {
                  await markAllAsRead();
                  queryClient.invalidateQueries({ queryKey: ['notif-unread-count'] });
                  queryClient.invalidateQueries({ queryKey: ['notifications'] });
                }}
                onMarkRead={async (id) => {
                  await markAsRead(id);
                  queryClient.invalidateQueries({ queryKey: ['notif-unread-count'] });
                  queryClient.invalidateQueries({ queryKey: ['notifications'] });
                }}
              />
            )}
          </div>

          {/* Run payroll - hidden on mobile */}
          {!isMobile && (
            <PermissionGate permission="salary.run">
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
                  minHeight: 'auto',
                }}
              >
                + Run payroll
              </button>
            </PermissionGate>
          )}

          {/* User avatar dropdown trigger */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                borderRadius: 8,
                border: '1px solid var(--border2)',
                background: menuOpen ? 'var(--surface2)' : 'transparent',
                cursor: 'pointer',
                transition: 'all .15s',
                minHeight: 'auto',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'rgba(79,142,247,0.15)',
                  border: '1px solid rgba(79,142,247,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 500,
                  color: 'var(--accent)',
                }}
              >
                {initials}
              </div>
              {!isMobile && <span style={{ fontSize: 10, color: 'var(--text3)' }}>▼</span>}
            </button>

            {/* Dropdown menu */}
            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 6,
                  width: isMobile ? 'calc(100vw - 24px)' : 220,
                  ...(isMobile ? { right: -12, position: 'fixed', top: 'var(--topbar-h)', left: 12, width: 'calc(100vw - 24px)' } : {}),
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                  overflow: 'hidden',
                  zIndex: 100,
                  animation: 'fadeIn .12s ease',
                }}
              >
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                    {user?.name || 'User'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{roleName}</div>
                </div>
                <div style={{ padding: '4px' }}>
                  <MenuButton
                    label="Your profile"
                    onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                  />
                  <MenuButton
                    label="My permissions"
                    onClick={() => { setMenuOpen(false); setShowPerms(true); }}
                  />
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
                  {hasPermission('users.view') && (
                    <MenuButton
                      label="Manage users"
                      onClick={() => { setMenuOpen(false); navigate('/users'); }}
                    />
                  )}
                  {hasPermission('roles.manage') && (
                    <MenuButton
                      label="Manage roles"
                      onClick={() => { setMenuOpen(false); navigate('/roles'); }}
                    />
                  )}
                  {hasPermission('settings.view') && (
                    <MenuButton
                      label="Settings"
                      onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                    />
                  )}
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
                  <MenuButton
                    label="Sign out"
                    danger
                    onClick={() => { setMenuOpen(false); logout(); }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals rendered outside the topbar */}
      {showPerms && <MyPermissionsModal onClose={() => setShowPerms(false)} />}
      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
    </>
  );
};

const MenuButton = ({ label, onClick, danger = false }) => (
  <button
    onClick={onClick}
    style={{
      display: 'block',
      width: '100%',
      textAlign: 'left',
      padding: '8px 10px',
      borderRadius: 6,
      border: 'none',
      background: 'transparent',
      color: danger ? '#f87171' : 'var(--text2)',
      fontSize: 12,
      cursor: 'pointer',
      transition: 'background .1s',
      minHeight: 'auto',
    }}
    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface2)')}
    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
  >
    {label}
  </button>
);

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
