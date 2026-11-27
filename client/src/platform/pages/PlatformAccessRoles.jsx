import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { listPlatformRoles, createPlatformRole, updatePlatformRole, deletePlatformRole } from '../api/platformApi';
import { platformErrorMessage } from '../api/platformAxios';
import { usePlatformAuth } from '../auth/platformAuthContext';
import { usePlatformPermission } from '../hooks/usePlatformPermission';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Btn from '../../components/ui/Btn';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { inputStyle, labelStyle, sectionTitle, errorBox, noteBox } from '../components/styles';

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;

/**
 * Create or edit a platform role. Only permissions the signed-in user holds
 * can be ticked (the server refuses anything else).
 */
function RoleModal({ role, groups, myPermissions, onClose, onDone }) {
  const creating = !role;
  const [form, setForm] = useState({
    key: role?.key || '',
    displayName: role?.displayName || '',
    description: role?.description || '',
    permissions: role?.permissions || [],
  });
  const toggle = (key, on) => setForm((f) => ({
    ...f, permissions: on ? [...new Set([...f.permissions, key])] : f.permissions.filter((p) => p !== key),
  }));
  const mutation = useMutation({
    mutationFn: () => (creating
      ? createPlatformRole({ key: form.key.trim(), displayName: form.displayName.trim(), description: form.description.trim(), permissions: form.permissions })
      : updatePlatformRole(role.key, { displayName: form.displayName.trim(), description: form.description.trim(), permissions: form.permissions })),
    onSuccess: () => { toast.success(creating ? 'Role created' : 'Role saved'); onDone(); },
    onError: (err) => toast.error(platformErrorMessage(err, 'Could not save the role')),
  });
  const keyProblem = creating && form.key && !KEY_PATTERN.test(form.key) ? 'A lowercase letter, then 1–40 lowercase letters, digits or underscores' : '';

  return (
    <Modal title={creating ? 'New platform role' : `Edit ${role.displayName}`} width={620} onClose={mutation.isPending ? undefined : onClose}>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="pr-key">Key</label>
            <input
              id="pr-key"
              value={form.key}
              disabled={!creating}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toLowerCase() }))}
              required
              style={{ ...inputStyle, fontFamily: 'var(--mono)' }}
            />
            {keyProblem && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{keyProblem}</div>}
          </div>
          <div>
            <label style={labelStyle} htmlFor="pr-name">Display name</label>
            <input id="pr-name" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} required style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="pr-desc">Description</label>
          <input id="pr-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={inputStyle} />
        </div>
        {Object.entries(groups).map(([group, perms]) => (
          <div key={group}>
            <div style={labelStyle}>{group}</div>
            {perms.map((p) => {
              const mine = myPermissions.includes(p.key);
              return (
                <label key={p.key} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '4px 0', opacity: mine ? 1 : 0.55, cursor: mine ? 'pointer' : 'not-allowed' }}>
                  <input type="checkbox" checked={form.permissions.includes(p.key)} disabled={!mine} onChange={(e) => toggle(p.key, e.target.checked)} style={{ marginTop: 3 }} />
                  <span>
                    {p.label}
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)' }}>
                      {p.description}{!mine && ' — you don’t hold this, so you can’t give it'}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn onClick={onClose} disabled={mutation.isPending}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={mutation.isPending || Boolean(keyProblem) || !form.key || !form.displayName.trim()}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

export default function PlatformAccessRoles() {
  const { user: me } = usePlatformAuth();
  const canManage = usePlatformPermission('platform.roles.manage');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // role, or 'new'

  const { data, isLoading, error } = useQuery({ queryKey: ['platform', 'platform-roles'], queryFn: listPlatformRoles });
  const roles = data?.roles || [];
  const groups = data?.permissionsByGroup || {};
  const labels = Object.fromEntries(Object.values(groups).flat().map((p) => [p.key, p.label]));
  const myPermissions = me?.permissions || [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['platform', 'platform-roles'] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'audit'] });
  };
  const remove = useMutation({
    mutationFn: (key) => deletePlatformRole(key),
    onSuccess: () => { toast.success('Role deleted'); refresh(); },
    onError: (err) => toast.error(platformErrorMessage(err, 'Could not delete the role')),
  });

  // Editable: not locked, not your own role, and holding nothing you lack.
  const canEdit = (r) => canManage && !r.locked && r.key !== me?.roleKey && r.permissions.every((p) => myPermissions.includes(p));

  return (
    <div>
      <PageHeader
        title="Platform roles"
        subtitle="What each kind of LogiForce staff member can do in this console"
        action={canManage && <Btn variant="primary" onClick={() => setEditing('new')}>New role</Btn>}
      />
      <div style={{ ...noteBox, marginBottom: 14 }}>
        These are platform roles, not company roles. Company roles are the role templates.
        The Platform Owner role always has every permission and cannot be changed.
      </div>
      {error && <div style={{ ...errorBox, marginBottom: 14 }}>{platformErrorMessage(error, 'Could not load platform roles')}</div>}
      {isLoading ? <LoadingSpinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {roles.map((r) => (
            <Card key={r.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{r.displayName}</div>
                {r.locked && <Badge variant="purple">locked</Badge>}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{r.userCount} user{r.userCount === 1 ? '' : 's'}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 8 }}>{r.key}</div>
              {r.description && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>{r.description}</div>}
              <div style={sectionTitle}>Permissions</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                {r.permissions.map((p) => <li key={p}>{labels[p] || p}</li>)}
                {r.permissions.length === 0 && <li>None</li>}
              </ul>
              {canEdit(r) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <Btn small onClick={() => setEditing(r)}>Edit</Btn>
                  <Btn
                    small
                    variant="danger"
                    disabled={remove.isPending || r.userCount > 0}
                    onClick={() => { if (window.confirm(`Delete the ${r.displayName} role?`)) remove.mutate(r.key); }}
                  >
                    Delete
                  </Btn>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <RoleModal
          role={editing === 'new' ? null : editing}
          groups={groups}
          myPermissions={myPermissions}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}
