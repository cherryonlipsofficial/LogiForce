import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getUsers, updateUser, activateUser, deactivateUser, getInactiveUsers } from '../api/usersApi';
import { getRoles } from '../api/rolesApi';
import { getAvatarColor, getInitials } from '../utils/avatarColor';
import { formatRelativeTime, formatShortDate } from '../utils/formatters';
import Card from '../components/ui/Card';
import KpiCard from '../components/ui/KpiCard';
import Btn from '../components/ui/Btn';
import PermissionGate from '../components/ui/PermissionGate';
import AddUserModal from '../components/settings/AddUserModal';
import EditUserModal from '../components/settings/EditUserModal';
import UserPermissionsModal from '../components/settings/UserPermissionsModal';
import ActionsDropdown from '../components/settings/ActionsDropdown';
import { useAuth } from '../context/AuthContext';

const ROLE_COLORS = {
  admin:      { bg: 'rgba(124,95,240,0.15)', text: '#a78bfa' },
  accountant: { bg: 'rgba(29,179,136,0.15)',  text: '#4ade9a' },
  ops:        { bg: 'rgba(79,142,247,0.15)',  text: '#7eb3fc' },
  operations: { bg: 'rgba(79,142,247,0.15)',  text: '#7eb3fc' },
  compliance: { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24' },
  sales:      { bg: 'rgba(29,179,136,0.15)',  text: '#4ade9a' },
  viewer:     { bg: 'rgba(136,135,128,0.15)', text: 'var(--color-text-secondary)' },
};

function getRoleColor(roleName = '') {
  return ROLE_COLORS[roleName] || { bg: 'rgba(216,90,48,0.15)', text: '#fb8c6b' };
}

function InactiveUserCard({ user, onActivate }) {
  const color    = getAvatarColor(user.name);
  const initials = getInitials(user.name);
  const roleColor = getRoleColor(user.roleId?.name);
  const queryClient = useQueryClient();

  const activateMutation = useMutation({
    mutationFn: () => activateUser(user._id),
    onSuccess:  () => {
      toast.success(`${user.name}'s account has been activated`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['inactive-users'] });
      queryClient.invalidateQueries({ queryKey: ['inactive-users-count'] });
    },
    onError: err => toast.error(err?.response?.data?.message || 'Activation failed'),
  });

  return (
    <div style={{
      background:   'var(--surface)',
      border:       '1px solid rgba(245,158,11,0.2)',
      borderRadius: 10,
      padding:      '12px 14px',
      display:      'flex',
      alignItems:   'center',
      gap:          12,
      minWidth:     240,
      flex:         '0 0 auto',
    }}>
      {/* Avatar */}
      <div style={{
        width:          36,
        height:         36,
        borderRadius:   '50%',
        background:     color.bg,
        color:          color.text,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontSize:       13,
        fontWeight:     500,
        flexShrink:     0,
        opacity:        0.6,
      }}>
        {initials}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
          {user.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
          {user.email}
        </div>
        <span style={{
          fontSize:   10,
          fontWeight: 500,
          padding:    '1px 7px',
          borderRadius: 4,
          background: roleColor.bg,
          color:      roleColor.text,
          marginTop:  4,
          display:    'inline-block',
        }}>
          {user.roleId?.displayName || 'No role'}
        </span>
      </div>

      {/* Activate button */}
      <button
        onClick={() => activateMutation.mutate()}
        disabled={activateMutation.isPending}
        style={{
          background:   'rgba(34,197,94,0.12)',
          border:       '1px solid rgba(34,197,94,0.3)',
          color:        '#4ade80',
          borderRadius: 8,
          padding:      '6px 12px',
          fontSize:     12,
          fontWeight:   500,
          cursor:       activateMutation.isPending ? 'wait' : 'pointer',
          flexShrink:   0,
          whiteSpace:   'nowrap',
        }}
      >
        {activateMutation.isPending ? 'Activating...' : 'Activate'}
      </button>
    </div>
  );
}

function getStatusInfo(user) {
  if (user.isActive) {
    return { label: 'Active', bg: 'rgba(34,197,94,0.12)', color: '#4ade80' };
  }
  if (!user.isActive && !user.activatedAt) {
    return { label: 'Pending activation', bg: 'rgba(245,158,11,0.12)', color: '#fbbf24' };
  }
  return { label: 'Deactivated', bg: 'var(--surface3)', color: 'var(--text3)' };
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  const [search, setSearch]                       = useState('');
  const [roleFilter, setRoleFilter]               = useState('all');
  const [statusFilter, setStatusFilter]           = useState('all');
  const [deactivatingId, setDeactivatingId]       = useState(null);

  const [addUserOpen, setAddUserOpen]             = useState(false);
  const [editUser, setEditUser]                   = useState(null);
  const [permissionsUser, setPermissionsUser]     = useState(null);
  const [actionsDropdownId, setActionsDropdownId] = useState(null);

  // Data fetching
  const { data: usersData, isLoading: usersLoading } =
    useQuery({ queryKey: ['users'], queryFn: getUsers });

  const { data: rolesData } =
    useQuery({ queryKey: ['roles'], queryFn: getRoles });

  const { data: inactiveData } = useQuery({
    queryKey: ['inactive-users'],
    queryFn:  () => getInactiveUsers().then(r => r.data),
    refetchInterval: 30000,
  });

  const users = usersData?.data || [];
  const roles = rolesData?.data || [];
  const inactiveUsers = inactiveData?.data || [];

  // Filter users client-side
  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole   = roleFilter === 'all' || u.roleId?._id === roleFilter;
    let matchStatus = true;
    if (statusFilter === 'active') matchStatus = u.isActive;
    else if (statusFilter === 'pending') matchStatus = !u.isActive && !u.activatedAt;
    else if (statusFilter === 'deactivated') matchStatus = !u.isActive && !!u.activatedAt;
    return matchSearch && matchRole && matchStatus;
  });

  // Close actions dropdown on outside click
  useEffect(() => {
    if (!actionsDropdownId) return;
    const handler = () => setActionsDropdownId(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [actionsDropdownId]);

  // Deactivate mutation
  const deactivateMutation = useMutation({
    mutationFn: ({ id, action }) => action === 'activate' ? activateUser(id) : deactivateUser(id),
    onSuccess: (_, vars) => {
      toast.success(vars.action === 'activate' ? 'User activated' : 'User deactivated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['inactive-users'] });
      queryClient.invalidateQueries({ queryKey: ['inactive-users-count'] });
      setDeactivatingId(null);
    },
    onError: err => toast.error(err?.response?.data?.message || 'Action failed'),
  });

  const statusFilters = ['all', 'active', 'pending', 'deactivated'];
  const statusLabels = { all: 'All', active: 'Active', pending: 'Pending activation', deactivated: 'Deactivated' };

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

      {/* Pending activation banner */}
      {inactiveUsers.length > 0 && (
        <div style={{
          background:   'rgba(245,158,11,0.06)',
          border:       '1px solid rgba(245,158,11,0.25)',
          borderRadius: 'var(--radius-lg)',
          padding:      '14px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width:        8,
              height:       8,
              borderRadius: '50%',
              background:   '#fbbf24',
              animation:    'pulse 2s infinite',
            }}/>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#fbbf24' }}>
              {inactiveUsers.length} account{inactiveUsers.length > 1 ? 's' : ''} pending activation
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 4 }}>
              These users cannot log in until activated
            </span>
          </div>

          <div style={{
            display:   'flex',
            gap:       10,
            flexWrap:  'wrap',
          }}>
            {inactiveUsers.map(user => (
              <InactiveUserCard
                key={user._id}
                user={user}
              />
            ))}
          </div>
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
        </div>
      )}

      {/* KPI strip — 4 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total users"   value={users.length} />
        <KpiCard
          label="Active"
          value={users.filter(u => u.isActive).length}
          color="#4ade80"
        />
        <KpiCard
          label="Pending activation"
          value={inactiveUsers.length}
          color={inactiveUsers.length > 0 ? '#fbbf24' : 'var(--text)'}
          sub={inactiveUsers.length > 0 ? 'Requires action' : 'None pending'}
        />
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
            }}>&#x2315;</span>
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
            {statusFilters.map(s => (
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
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                {statusLabels[s]}
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
                  const status = getStatusInfo(user);

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
                        <span style={{
                          fontSize: 11, fontWeight: 500, padding: '3px 9px',
                          borderRadius: 20, background: status.bg, color: status.color,
                        }}>
                          {status.label}
                        </span>
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
                            <span style={{ fontSize: 11, color: user.isActive ? '#f87171' : '#4ade80' }}>
                              {user.isActive ? 'Deactivate' : 'Activate'} {user.name.split(' ')[0]}?
                            </span>
                            <button
                              onClick={() => deactivateMutation.mutate({
                                id: user._id,
                                action: user.isActive ? 'deactivate' : 'activate',
                              })}
                              style={{
                                padding: '3px 8px', borderRadius: 6, fontSize: 11,
                                background: user.isActive ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                                color: user.isActive ? '#f87171' : '#4ade80',
                                border: `1px solid ${user.isActive ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                                cursor: 'pointer',
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
                            <div style={{ position: 'relative' }}>
                              <Btn small variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionsDropdownId(
                                    actionsDropdownId === user._id ? null : user._id
                                  );
                                }}
                              >•••</Btn>
                              {actionsDropdownId === user._id && (
                                <ActionsDropdown
                                  user={user}
                                  currentUserId={currentUser?._id}
                                  isOpen={true}
                                  onClose={() => setActionsDropdownId(null)}
                                  onEdit={() => { setEditUser(user); setActionsDropdownId(null); }}
                                  onPermissions={() => { setPermissionsUser(user); setActionsDropdownId(null); }}
                                  onDeactivate={() => { setDeactivatingId(user._id); setActionsDropdownId(null); }}
                                  onActivate={() => {
                                    activateUser(user._id).then(() => {
                                      toast.success(`${user.name}'s account has been activated`);
                                      queryClient.invalidateQueries({ queryKey: ['users'] });
                                      queryClient.invalidateQueries({ queryKey: ['inactive-users'] });
                                      queryClient.invalidateQueries({ queryKey: ['inactive-users-count'] });
                                    }).catch(err => toast.error(err?.response?.data?.message || 'Activation failed'));
                                    setActionsDropdownId(null);
                                  }}
                                />
                              )}
                            </div>
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

      {/* Add / Edit user modals */}
      {addUserOpen && (
        <AddUserModal
          roles={roles}
          onClose={() => setAddUserOpen(false)}
          onSuccess={() => setAddUserOpen(false)}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          roles={roles}
          onClose={() => setEditUser(null)}
          onSuccess={() => setEditUser(null)}
        />
      )}
      {permissionsUser && (
        <UserPermissionsModal
          user={permissionsUser}
          onClose={() => setPermissionsUser(null)}
        />
      )}

    </div>
  );
}
