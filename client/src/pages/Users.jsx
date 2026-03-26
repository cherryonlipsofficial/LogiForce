import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getUsers, updateUser } from '../api/usersApi';
import { getRoles } from '../api/rolesApi';
import { getAvatarColor, getInitials } from '../utils/avatarColor';
import { formatRelativeTime, formatShortDate } from '../utils/formatters';
import Card from '../components/ui/Card';
import KpiCard from '../components/ui/KpiCard';
import Btn from '../components/ui/Btn';
import PermissionGate from '../components/ui/PermissionGate';

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

export default function UsersPage() {
  const queryClient = useQueryClient();

  const [search, setSearch]                       = useState('');
  const [roleFilter, setRoleFilter]               = useState('all');
  const [statusFilter, setStatusFilter]           = useState('all');
  const [deactivatingId, setDeactivatingId]       = useState(null);

  // Modal states — placeholders for now, wired in 3b and 3c
  const [addUserOpen, setAddUserOpen]             = useState(false);
  const [editUser, setEditUser]                   = useState(null);
  const [permissionsUser, setPermissionsUser]     = useState(null);
  const [actionsDropdownId, setActionsDropdownId] = useState(null);

  // Data fetching
  const { data: usersData, isLoading: usersLoading } =
    useQuery({ queryKey: ['users'], queryFn: () => getUsers().then(r => r.data) });

  const { data: rolesData } =
    useQuery({ queryKey: ['roles'], queryFn: () => getRoles().then(r => r.data) });

  const users = usersData?.users || [];
  const roles = rolesData?.roles || [];

  // Filter users client-side
  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole   = roleFilter === 'all' || u.roleId?._id === roleFilter;
    const matchStatus = statusFilter === 'all' ||
      (statusFilter === 'active'   &&  u.isActive) ||
      (statusFilter === 'inactive' && !u.isActive);
    return matchSearch && matchRole && matchStatus;
  });

  // Deactivate mutation
  const deactivateMutation = useMutation({
    mutationFn: ({ id, isActive }) => updateUser(id, { isActive }),
    onSuccess: (_, vars) => {
      toast.success(vars.isActive ? 'User activated' : 'User deactivated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeactivatingId(null);
    },
    onError: err => toast.error(err?.response?.data?.message || 'Action failed'),
  });

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)' }}>User accounts</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
            {users.length} users · {roles.length} roles defined
          </p>
        </div>
        <PermissionGate permission="users.create">
          <Btn variant="primary" onClick={() => setAddUserOpen(true)}>
            + Add user
          </Btn>
        </PermissionGate>
      </div>

      {/* KPI strip — 4 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total users"   value={users.length} />
        <KpiCard label="Active"        value={users.filter(u => u.isActive).length}  color="#4ade80" />
        <KpiCard label="Inactive"      value={users.filter(u => !u.isActive).length} color="#f87171" />
        <KpiCard label="Roles defined" value={roles.length} />
      </div>

      {/* Table card */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>

        {/* Filter bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 18px', borderBottom: '1px solid var(--border)',
        }}>
          {/* Search */}
          <div style={{ position: 'relative', width: 240 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or email..."
              style={{ paddingLeft: 32, height: 34, width: '100%' }}
            />
            <span style={{
              position: 'absolute', left: 10, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: 13,
            }}>⌕</span>
          </div>

          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            style={{ width: 160, height: 34 }}
          >
            <option value="all">All roles</option>
            {roles.map(r => (
              <option key={r._id} value={r._id}>{r.displayName}</option>
            ))}
          </select>

          {/* Status filter — pill buttons */}
          <div style={{ display: 'flex', gap: 4 }}>
            {['all', 'active', 'inactive'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                  background: statusFilter === s
                    ? 'rgba(79,142,247,0.15)' : 'var(--surface3)',
                  color: statusFilter === s ? 'var(--accent)' : 'var(--text2)',
                  border: statusFilter === s
                    ? '1px solid rgba(79,142,247,0.35)' : '1px solid var(--border2)',
                  cursor: 'pointer', transition: 'all .15s', textTransform: 'capitalize',
                }}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>
            {filtered.length} of {users.length} users
          </div>
        </div>

        {/* Table */}
        {usersLoading ? (
          <div style={{ padding: '0 18px' }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{
                height: 52, borderBottom: '1px solid var(--border)',
                background: 'var(--surface2)', borderRadius: 4,
                margin: '8px 0', opacity: 1 - i * 0.15,
                animation: 'pulse 1.5s ease-in-out infinite',
              }}/>
            ))}
            <style>{`@keyframes pulse{0%,100%{opacity:.6}50%{opacity:.3}}`}</style>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['User', 'Role', 'Status', 'Last login', 'Created', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '9px 16px', fontSize: 11, color: 'var(--text3)',
                    fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em',
                    textAlign: 'left', background: 'var(--surface2)',
                    borderBottom: '1px solid var(--border)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--text3)' }}>
                    No users match your filters
                  </td>
                </tr>
              ) : (
                filtered.map(user => {
                  const color     = getAvatarColor(user.name);
                  const initials  = getInitials(user.name);
                  const roleColor = getRoleColor(user.roleId?.name);
                  const isDeactivating = deactivatingId === user._id;

                  return (
                    <tr
                      key={user._id}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background .1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* User column */}
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: color.bg, color: color.text,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 500, flexShrink: 0,
                          }}>{initials}</div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 400, color: 'var(--text)' }}>
                              {user.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role column */}
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 20,
                          background: roleColor.bg, color: roleColor.text,
                        }}>
                          {user.roleId?.displayName || 'No role'}
                        </span>
                      </td>

                      {/* Status column */}
                      <td style={{ padding: '10px 16px' }}>
                        {user.isActive
                          ? <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 9px',
                              borderRadius: 20, background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>
                              Active
                            </span>
                          : <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 9px',
                              borderRadius: 20, background: 'var(--surface3)', color: 'var(--text3)' }}>
                              Inactive
                            </span>
                        }
                      </td>

                      {/* Last login column */}
                      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text2)' }}>
                        {formatRelativeTime(user.lastLogin)}
                      </td>

                      {/* Created column */}
                      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text3)' }}>
                        {formatShortDate(user.createdAt)}
                      </td>

                      {/* Actions column */}
                      <td style={{ padding: '10px 16px' }}>
                        {isDeactivating ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: '#f87171' }}>
                              {user.isActive ? 'Deactivate' : 'Activate'} {user.name.split(' ')[0]}?
                            </span>
                            <button
                              onClick={() => deactivateMutation.mutate({ id: user._id, isActive: !user.isActive })}
                              style={{
                                padding: '3px 8px', borderRadius: 6, fontSize: 11,
                                background: 'rgba(239,68,68,0.15)', color: '#f87171',
                                border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer',
                              }}
                            >
                              {deactivateMutation.isPending ? '...' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setDeactivatingId(null)}
                              style={{
                                padding: '3px 8px', borderRadius: 6, fontSize: 11,
                                background: 'var(--surface3)', color: 'var(--text2)',
                                border: '1px solid var(--border2)', cursor: 'pointer',
                              }}
                            >Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <PermissionGate permission="users.edit">
                              <Btn small variant="ghost" onClick={() => setEditUser(user)}>
                                Edit
                              </Btn>
                            </PermissionGate>
                            <PermissionGate permission="roles.manage">
                              <Btn small variant="ghost" onClick={() => setPermissionsUser(user)}>
                                Permissions
                              </Btn>
                            </PermissionGate>
                            <Btn small variant="ghost"
                              onClick={() => setActionsDropdownId(
                                actionsDropdownId === user._id ? null : user._id
                              )}
                            >•••</Btn>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {/* Table footer */}
        {!usersLoading && (
          <div style={{
            padding: '10px 18px', borderTop: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text3)',
          }}>
            Showing {filtered.length} of {users.length} users
          </div>
        )}
      </Card>

      {/* Modal placeholders — will be replaced in 3b and 3c */}
      {addUserOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 24,
            color: 'var(--text)', fontSize: 13 }}>
            Add User Modal — coming in Prompt 3b
            <br/><br/>
            <Btn onClick={() => setAddUserOpen(false)}>Close</Btn>
          </div>
        </div>
      )}
      {editUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 24,
            color: 'var(--text)', fontSize: 13 }}>
            Edit User Modal — coming in Prompt 3b
            <br/><br/>
            <Btn onClick={() => setEditUser(null)}>Close</Btn>
          </div>
        </div>
      )}
      {permissionsUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 24,
            color: 'var(--text)', fontSize: 13 }}>
            Permissions Modal — coming in Prompt 3c
            <br/><br/>
            <Btn onClick={() => setPermissionsUser(null)}>Close</Btn>
          </div>
        </div>
      )}

    </div>
  );
}
