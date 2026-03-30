import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getUsers, createUser, updateUser, deleteUser, getUserPermissions, addPermissionOverride, removePermissionOverride } from '../../api/usersApi';
import { getRoles, getPermissionsList } from '../../api/rolesApi';
import PageHeader from '../ui/PageHeader';
import Btn from '../ui/Btn';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import LoadingSpinner from '../ui/LoadingSpinner';
import EmptyState from '../ui/EmptyState';
import PermissionGate from '../ui/PermissionGate';
import { formatDate } from '../../utils/formatters';

/* ── helpers ── */
const roleBadgeColors = ['teal', 'purple', 'info', 'warning', 'danger', 'success'];
const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const roleBadgeVariant = (name) => roleBadgeColors[hashStr(name) % roleBadgeColors.length];

const variantMap = {
  teal: { background: 'rgba(29,179,136,0.12)', color: '#1DB388', border: '1px solid rgba(29,179,136,0.2)' },
  purple: { background: 'rgba(124,95,240,0.12)', color: '#a78bfa', border: '1px solid rgba(124,95,240,0.2)' },
  info: { background: 'rgba(79,142,247,0.12)', color: '#7eb3fc', border: '1px solid rgba(79,142,247,0.2)' },
  warning: { background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' },
  danger: { background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' },
  success: { background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' },
};

const getInitials = (name) =>
  (name || '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

/* ── input style ── */
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

/* ────────────────────────────────────────────────
   EDIT USER MODAL
──────────────────────────────────────────────── */
const EditUserModal = ({ user, onClose, onSave, roles }) => {
  const [form, setForm] = useState({
    name: user.name || '',
    email: user.email || '',
    roleId: user.roleId?._id || user.roleId || '',
    status: user.status || 'active',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(user._id, form);
  };

  return (
    <Modal title="Edit user" width={420} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Name</label>
          <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Email</label>
          <input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Role</label>
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={form.roleId}
            onChange={(e) => setForm({ ...form, roleId: e.target.value })}
          >
            <option value="">Select role</option>
            {(roles || []).map((r) => (
              <option key={r._id} value={r._id}>
                {r.displayName || r.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Status</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['active', 'inactive'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm({ ...form, status: s })}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: form.status === s ? '1px solid var(--accent)' : '1px solid var(--border2)',
                  background: form.status === s ? 'rgba(79,142,247,0.12)' : 'var(--surface2)',
                  color: form.status === s ? 'var(--accent)' : 'var(--text2)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <Btn variant="primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
          Save changes
        </Btn>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12, lineHeight: 1.5 }}>
          Changing this user's role will immediately update their access permissions.
        </div>
      </form>
    </Modal>
  );
};

/* ────────────────────────────────────────────────
   ADD USER MODAL
──────────────────────────────────────────────── */
const AddUserModal = ({ onClose, onCreate, roles }) => {
  const [form, setForm] = useState({ name: '', email: '', roleId: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.email || !form.roleId || !form.password) {
      setError('All fields are required');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    onCreate({ name: form.name, email: form.email, roleId: form.roleId, password: form.password });
  };

  return (
    <Modal title="Add user" width={440} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Name *</label>
          <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Email *</label>
          <input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Role *</label>
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={form.roleId}
            onChange={(e) => setForm({ ...form, roleId: e.target.value })}
          >
            <option value="">Select role</option>
            {(roles || []).map((r) => (
              <option key={r._id} value={r._id}>
                {r.displayName || r.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Password *</label>
          <input style={inputStyle} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Confirm password *</label>
          <input style={inputStyle} type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
        </div>
        {error && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{error}</div>
        )}
        <Btn variant="primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
          Create user
        </Btn>
      </form>
    </Modal>
  );
};

/* ────────────────────────────────────────────────
   USER PERMISSIONS MODAL
──────────────────────────────────────────────── */
const UserPermissionsModal = ({ user, onClose }) => {
  const qc = useQueryClient();
  const [grantDropdown, setGrantDropdown] = useState(false);
  const [denyDropdown, setDenyDropdown] = useState(false);
  const [grantReason, setGrantReason] = useState('');
  const [denyReason, setDenyReason] = useState('');
  const [selectedGrant, setSelectedGrant] = useState(null);
  const [selectedDeny, setSelectedDeny] = useState(null);
  const [showEffective, setShowEffective] = useState(false);

  const { data: permData, isLoading } = useQuery({
    queryKey: ['user-permissions', user._id],
    queryFn: () => getUserPermissions(user._id),
  });

  const { data: allPerms } = useQuery({
    queryKey: ['permissions-list'],
    queryFn: getPermissionsList,
  });

  const addOverride = useMutation({
    mutationFn: (data) => addPermissionOverride(user._id, data),
    onSuccess: () => {
      toast.success('Permission override added');
      qc.invalidateQueries(['user-permissions', user._id]);
      setGrantDropdown(false);
      setDenyDropdown(false);
      setSelectedGrant(null);
      setSelectedDeny(null);
      setGrantReason('');
      setDenyReason('');
    },
    onError: () => toast.error('Failed to add override'),
  });

  const removeOverride = useMutation({
    mutationFn: (key) => removePermissionOverride(user._id, key),
    onSuccess: () => {
      toast.success('Override removed');
      qc.invalidateQueries(['user-permissions', user._id]);
    },
    onError: () => toast.error('Failed to remove override'),
  });

  const rolePerms = permData?.rolePermissions || [];
  const overrides = permData?.overrides || [];
  const effective = permData?.effective || [];
  const roleName = user.roleId?.displayName || user.roleId?.name || 'Unknown';

  const extraOverrides = overrides.filter((o) => o.granted);
  const deniedOverrides = overrides.filter((o) => !o.granted);

  const allPermsList = allPerms?.data
    ? Object.values(allPerms.data.byModule || {}).flat()
    : allPerms?.permissions || [];
  const rolePermKeys = rolePerms.map((p) => (typeof p === 'string' ? p : p.key));
  const overrideKeys = overrides.map((o) => o.key);

  const grantablePerms = allPermsList.filter(
    (p) => !rolePermKeys.includes(p.key) && !overrideKeys.includes(p.key)
  );
  const deniablePerms = allPermsList.filter(
    (p) => rolePermKeys.includes(p.key) && !overrideKeys.includes(p.key)
  );

  const effectiveGrouped = {};
  (effective.length ? effective : rolePermKeys).forEach((p) => {
    const key = typeof p === 'string' ? p : p.key;
    const mod = key.split('.')[0];
    if (!effectiveGrouped[mod]) effectiveGrouped[mod] = [];
    effectiveGrouped[mod].push(key);
  });

  if (isLoading) return <Modal title="Permission overrides" width={580} onClose={onClose}><LoadingSpinner /></Modal>;

  return (
    <Modal title={`${user.name} — Permission overrides`} width={580} onClose={onClose}>
      {/* Section 1: Role summary */}
      <div
        style={{
          background: 'var(--surface2)',
          borderRadius: 8,
          padding: '12px 14px',
          marginBottom: 20,
          fontSize: 13,
          color: 'var(--text2)',
          lineHeight: 1.6,
        }}
      >
        This user has the <strong style={{ color: 'var(--text)' }}>{roleName}</strong> role which grants{' '}
        <strong style={{ color: 'var(--text)' }}>{rolePermKeys.length}</strong> permissions.
      </div>

      {/* Section 2: Extra permissions */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Extra permissions</div>
        {extraOverrides.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>No extra permissions granted</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {extraOverrides.map((o) => (
              <div
                key={o.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--surface2)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{o.label || o.key}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{o.module || o.key.split('.')[0]}</div>
                  {o.reason && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{o.reason}</div>}
                </div>
                <Btn small variant="danger" onClick={() => removeOverride.mutate(o.key)} disabled={removeOverride.isPending}>
                  {removeOverride.isPending ? 'Removing...' : 'Remove'}
                </Btn>
              </div>
            ))}
          </div>
        )}
        {!grantDropdown ? (
          <Btn small onClick={() => setGrantDropdown(true)}>+ Grant extra permission</Btn>
        ) : (
          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
            <select
              style={{ ...inputStyle, marginBottom: 8 }}
              value={selectedGrant?.key || ''}
              onChange={(e) => setSelectedGrant(grantablePerms.find((p) => p.key === e.target.value) || null)}
            >
              <option value="">Select permission</option>
              {grantablePerms.map((p) => (
                <option key={p.key} value={p.key}>{p.label || p.key}</option>
              ))}
            </select>
            {selectedGrant && (
              <>
                <input style={{ ...inputStyle, marginBottom: 8 }} placeholder="Reason (optional)" value={grantReason} onChange={(e) => setGrantReason(e.target.value)} />
                <Btn small variant="primary" onClick={() => addOverride.mutate({ key: selectedGrant.key, granted: true, reason: grantReason })} disabled={addOverride.isPending}>
                  {addOverride.isPending ? 'Adding...' : 'Confirm'}
                </Btn>
              </>
            )}
            <Btn small style={{ marginLeft: 6 }} onClick={() => { setGrantDropdown(false); setSelectedGrant(null); }}>Cancel</Btn>
          </div>
        )}
      </div>

      {/* Section 3: Denied permissions */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Denied permissions</div>
        {deniedOverrides.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>No permissions have been denied</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {deniedOverrides.map((o) => (
              <div
                key={o.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--surface2)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{o.label || o.key}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{o.module || o.key.split('.')[0]}</div>
                  {o.reason && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{o.reason}</div>}
                </div>
                <Btn small variant="success" onClick={() => removeOverride.mutate(o.key)} disabled={removeOverride.isPending}>
                  {removeOverride.isPending ? 'Restoring...' : 'Restore'}
                </Btn>
              </div>
            ))}
          </div>
        )}
        {!denyDropdown ? (
          <Btn small onClick={() => setDenyDropdown(true)}>+ Deny a permission</Btn>
        ) : (
          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
            <select
              style={{ ...inputStyle, marginBottom: 8 }}
              value={selectedDeny?.key || ''}
              onChange={(e) => setSelectedDeny(deniablePerms.find((p) => p.key === e.target.value) || null)}
            >
              <option value="">Select permission</option>
              {deniablePerms.map((p) => (
                <option key={p.key} value={p.key}>{p.label || p.key}</option>
              ))}
            </select>
            {selectedDeny && (
              <>
                <input style={{ ...inputStyle, marginBottom: 8 }} placeholder="Reason (optional)" value={denyReason} onChange={(e) => setDenyReason(e.target.value)} />
                <Btn small variant="danger" onClick={() => addOverride.mutate({ key: selectedDeny.key, granted: false, reason: denyReason })} disabled={addOverride.isPending}>
                  {addOverride.isPending ? 'Denying...' : 'Confirm deny'}
                </Btn>
              </>
            )}
            <Btn small style={{ marginLeft: 6 }} onClick={() => { setDenyDropdown(false); setSelectedDeny(null); }}>Cancel</Btn>
          </div>
        )}
      </div>

      {/* Bottom: effective permissions */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
          Effective permissions: {effective.length || rolePermKeys.length} total
        </div>
        <button
          onClick={() => setShowEffective(!showEffective)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: 11,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {showEffective ? 'Hide' : 'View all effective permissions'}
        </button>
        {showEffective && (
          <div style={{ marginTop: 10, maxHeight: 200, overflowY: 'auto' }}>
            {Object.keys(effectiveGrouped).sort().map((mod) => (
              <div key={mod} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text2)', textTransform: 'capitalize', marginBottom: 4 }}>{mod}</div>
                {effectiveGrouped[mod].sort().map((key) => (
                  <div key={key} style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', paddingLeft: 8, lineHeight: 1.8 }}>{key}</div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

/* ────────────────────────────────────────────────
   USERS PANEL (main export)
──────────────────────────────────────────────── */
const UsersPanel = () => {
  const qc = useQueryClient();
  const [editUser, setEditUser] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [permsUser, setPermsUser] = useState(null);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => getUsers(),
  });

  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
  });

  const roles = rolesData?.data || rolesData?.roles || [];
  const users = usersData?.data || usersData?.users || [];

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateUser(id, data),
    onSuccess: () => {
      toast.success('User updated');
      qc.invalidateQueries(['users']);
      setEditUser(null);
    },
    onError: () => toast.error('Failed to update user'),
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      toast.success('User created');
      qc.invalidateQueries(['users']);
      setShowAdd(false);
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to create user'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => deleteUser(id),
    onSuccess: () => {
      toast.success('User deactivated');
      qc.invalidateQueries(['users']);
    },
    onError: () => toast.error('Failed to deactivate user'),
  });

  const handleDeactivate = (u) => {
    if (window.confirm(`Deactivate ${u.name}? They will lose access immediately.`)) {
      deactivateMutation.mutate(u._id);
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="User accounts"
        action={
          <PermissionGate permission="users.create">
            <Btn variant="primary" onClick={() => setShowAdd(true)}>+ Add user</Btn>
          </PermissionGate>
        }
      />

      {users.length === 0 ? (
        <EmptyState title="No users" message="Create a user to get started" />
      ) : (
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['User', 'Role', 'Status', 'Last login', 'Actions'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '10px 16px',
                      fontSize: 11,
                      fontWeight: 500,
                      color: 'var(--text3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--surface2)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const rName = u.roleId?.displayName || u.roleId?.name || u.role || '—';
                const variant = roleBadgeVariant(rName);
                const vStyles = variantMap[variant] || variantMap.info;

                return (
                  <tr key={u._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar initials={getInitials(u.name)} size={32} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{u.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: '3px 8px',
                          borderRadius: 6,
                          display: 'inline-block',
                          whiteSpace: 'nowrap',
                          ...vStyles,
                        }}
                      >
                        {rName}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <Badge variant={u.status === 'active' ? 'success' : 'default'}>
                        {u.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text2)' }}>
                      {u.lastLogin ? formatDate(u.lastLogin) : 'Never'}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <PermissionGate permission="users.edit">
                          <Btn small onClick={() => setEditUser(u)}>Edit</Btn>
                        </PermissionGate>
                        <PermissionGate permission="roles.manage">
                          <Btn small onClick={() => setPermsUser(u)}>Permissions</Btn>
                        </PermissionGate>
                        <PermissionGate permission="users.delete">
                          <Btn small variant="danger" onClick={() => handleDeactivate(u)} disabled={deactivateMutation.isPending}>
                            {deactivateMutation.isPending ? 'Deactivating...' : 'Deactivate'}
                          </Btn>
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editUser && (
        <EditUserModal
          user={editUser}
          roles={roles}
          onClose={() => setEditUser(null)}
          onSave={(id, data) => updateMutation.mutate({ id, data })}
        />
      )}

      {showAdd && (
        <AddUserModal
          roles={roles}
          onClose={() => setShowAdd(false)}
          onCreate={(data) => createMutation.mutate(data)}
        />
      )}

      {permsUser && (
        <UserPermissionsModal
          user={permsUser}
          onClose={() => setPermsUser(null)}
        />
      )}
    </div>
  );
};

export default UsersPanel;
