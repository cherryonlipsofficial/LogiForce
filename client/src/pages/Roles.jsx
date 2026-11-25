import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRoles, getPermissionsList } from '../api/rolesApi';
import Badge from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import EmptyState from '../components/ui/EmptyState';
import { useBreakpoint } from '../hooks/useBreakpoint';

/* ── helpers ── */
const colorFromName = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 55%)`;
};

/* ── Toggle Switch (display only: roles are read-only for companies) ── */
const Toggle = ({ on, size = 'normal' }) => {
  const w = size === 'small' ? 32 : 36;
  const h = size === 'small' ? 18 : 20;
  const dot = h - 4;
  return (
    <button
      type="button"
      disabled
      aria-pressed={on}
      style={{
        width: w, height: h, borderRadius: h,
        background: on ? '#4f8ef7' : 'var(--surface3)',
        border: 'none', padding: 2, cursor: 'default',
        transition: 'background .15s', flexShrink: 0,
        position: 'relative',
      }}
    >
      <div style={{
        width: dot, height: dot, borderRadius: '50%',
        background: '#fff', transition: 'transform .15s',
        transform: on ? `translateX(${w - dot - 4}px)` : 'translateX(0)',
      }} />
    </button>
  );
};

/* ══════════════════════════════════════════
   Permission Matrix (read-only)
   ══════════════════════════════════════════ */
const PermissionMatrix = ({ byModule, localPermissions, searchFilter, maxHeight }) => {
  const [collapsed, setCollapsed] = useState({});
  const lowerFilter = (searchFilter || '').toLowerCase();

  const filteredModules = useMemo(() => {
    if (!byModule) return [];
    return Object.entries(byModule).map(([mod, perms]) => {
      const filtered = lowerFilter
        ? perms.filter(p =>
            p.key.toLowerCase().includes(lowerFilter) ||
            p.label.toLowerCase().includes(lowerFilter) ||
            (p.description || '').toLowerCase().includes(lowerFilter) ||
            mod.toLowerCase().includes(lowerFilter)
          )
        : perms;
      return { mod, perms: filtered, allPerms: perms };
    }).filter(m => m.perms.length > 0);
  }, [byModule, lowerFilter]);

  // Auto-expand when filtering
  useEffect(() => {
    if (lowerFilter) setCollapsed({});
  }, [lowerFilter]);

  return (
    <div style={{ maxHeight, overflowY: 'auto' }}>
      {filteredModules.map(({ mod, perms, allPerms }) => {
        const granted = allPerms.filter(p => localPermissions.includes(p.key)).length;
        const total = allPerms.length;
        const isCollapsed = collapsed[mod];
        const allOn = granted === total;
        const someOn = granted > 0 && granted < total;

        return (
          <div key={mod} style={{ marginBottom: 2 }}>
            {/* Module header */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', background: 'var(--surface2)',
                borderRadius: 8, cursor: 'pointer', userSelect: 'none',
              }}
              onClick={() => setCollapsed(c => ({ ...c, [mod]: !c[mod] }))}
            >
              <span style={{
                fontSize: 10, color: 'var(--text3)', transition: 'transform .15s',
                transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              }}>
                &#9660;
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--text2)', flex: 1,
              }}>
                {mod}
              </span>
              {/* Module state */}
              <span
                style={{
                  width: 16, height: 16, borderRadius: 4, boxSizing: 'border-box',
                  border: '2px solid ' + (allOn ? '#4f8ef7' : someOn ? '#4f8ef7' : 'var(--text3)'),
                  background: allOn ? '#4f8ef7' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: '#fff', lineHeight: 1, padding: 0,
                }}
              >
                {allOn ? '\u2713' : someOn ? '\u2014' : ''}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 40, textAlign: 'right' }}>
                {granted} / {total}
              </span>
            </div>

            {/* Permission rows */}
            {!isCollapsed && perms.map(p => {
              const isOn = localPermissions.includes(p.key);
              return (
                <div
                  key={p.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 12px 8px 38px',
                    borderBottom: '1px solid var(--border)',
                    opacity: isOn ? 1 : 0.55,
                    transition: 'opacity .15s',
                  }}
                >
                  <Toggle on={isOn} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{p.label}</div>
                    {p.description && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{p.description}</div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)',
                    opacity: 0.6, flexShrink: 0,
                  }}>
                    {p.key}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/* ── shared styles ── */
const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border2)', background: 'var(--surface2)',
  color: 'var(--text)', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
};

/* ══════════════════════════════════════════
   MAIN ROLES PAGE
   ══════════════════════════════════════════ */
export default function RolesPage() {
  const { isMobile } = useBreakpoint();

  // Data fetching
  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
    retry: 1,
  });
  const { data: permissionsList, isLoading: permsLoading } = useQuery({
    queryKey: ['permissions-list'],
    queryFn: getPermissionsList,
    retry: 1,
  });

  const roles = rolesData?.data || rolesData || [];

  // State
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [search, setSearch] = useState('');

  // Default to the first role; roles are read-only, so the matrix always
  // shows the role's saved permissions.
  const selectedRole = roles.find(r => r._id === selectedRoleId) || roles[0];

  const selectRole = (role) => {
    if (selectedRole?._id === role._id) return;
    setSelectedRoleId(role._id);
    setSearch('');
  };

  if (rolesLoading || permsLoading) {
    return <LoadingSpinner style={{ padding: 60 }} />;
  }

  const userCount = selectedRole?.userCount || 0;

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 0, height: isMobile ? 'auto' : 'calc(100vh - var(--topbar-h) - 32px)' }}>
      {/* ──── LEFT COLUMN: Role list ──── */}
      <div style={{
        width: isMobile ? '100%' : 260, flexShrink: 0, background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Roles</span>
        </div>

        {/* Role cards */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {roles.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
              No roles yet
            </div>
          ) : roles.map(role => {
            const isSelected = role._id === selectedRole?._id;
            const permCount = (role.permissions || []).length;
            const users = role.userCount || 0;
            return (
              <div
                key={role._id}
                onClick={() => selectRole(role)}
                style={{
                  padding: '10px 12px', marginBottom: 4, borderRadius: 8,
                  cursor: 'pointer', transition: 'all .15s',
                  borderLeft: `3px solid ${colorFromName(role.name || '')}`,
                  background: isSelected ? 'rgba(79,142,247,0.08)' : 'transparent',
                  border: isSelected
                    ? `1px solid rgba(79,142,247,0.4)`
                    : '1px solid transparent',
                  borderLeftWidth: 3,
                  borderLeftStyle: 'solid',
                  borderLeftColor: colorFromName(role.name || ''),
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface2)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                    {role.displayName || role.name}
                  </span>
                  {role.isSystemRole && (
                    <Badge variant="purple" style={{ fontSize: 9, padding: '1px 6px' }}>System</Badge>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                  {role.name}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                  <span>{permCount} permissions</span>
                  <span>|</span>
                  <span>{users} users</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ──── RIGHT COLUMN: Permission matrix ──── */}
      <div style={{
        flex: 1, marginLeft: isMobile ? 0 : 16, marginTop: isMobile ? 16 : 0, display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden', position: 'relative',
      }}>
        {!selectedRole ? (
          <EmptyState
            icon=""
            title="Select a role"
            message="Select a role to see its permissions"
          />
        ) : (
          <>
            {/* Role header */}
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>
                {selectedRole.displayName || selectedRole.name}
              </div>
              {selectedRole.description && (
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                  {selectedRole.description}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
                Slug: <span style={{ fontFamily: 'var(--mono)' }}>{selectedRole.name}</span>
                {' '}&middot;{' '}
                {userCount} user{userCount !== 1 ? 's' : ''} with this role
              </div>

              {/* Read-only note */}
              <div style={{
                marginTop: 10, padding: '10px 14px', borderRadius: 8,
                background: 'rgba(124,95,240,0.08)', border: '1px solid rgba(124,95,240,0.2)',
                fontSize: 12, color: 'var(--text2)', lineHeight: 1.5,
              }}>
                Roles are set up by LogiForce and can&apos;t be changed here.
                To change what one person can do, use Permissions on the Users page.
              </div>
            </div>

            {/* Search bar */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
              <input
                placeholder="Filter permissions..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  ...inputStyle, width: '100%',
                  background: 'var(--surface3)',
                }}
              />
            </div>

            {/* Permission matrix */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
              {(permissionsList?.data?.byModule || permissionsList?.byModule) ? (
                <PermissionMatrix
                  byModule={permissionsList.data?.byModule || permissionsList.byModule}
                  localPermissions={selectedRole.permissions || []}
                  searchFilter={search}
                />
              ) : (
                <div style={{ padding: 20, color: 'var(--text3)', fontSize: 12 }}>
                  No permissions configured
                </div>
              )}
            </div>

          </>
        )}
      </div>

    </div>
  );
}
