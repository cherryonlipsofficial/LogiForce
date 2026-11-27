import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  listPlatformUsers, listPlatformRoles, invitePlatformUser, changePlatformUserRole,
  deactivatePlatformUser, reactivatePlatformUser, resendPlatformInvite,
} from '../api/platformApi';
import { platformErrorMessage } from '../api/platformAxios';
import { usePlatformAuth } from '../auth/platformAuthContext';
import { usePlatformPermission } from '../hooks/usePlatformPermission';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Btn from '../../components/ui/Btn';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { inputStyle, labelStyle, tableStyle, thStyle, tdStyle, errorBox, noteBox, formatDateTime } from '../components/styles';

const OWNER_ROLE = 'platform_owner';

/**
 * Roles the signed-in user may give: every permission of the role is one they
 * hold, and only an Owner may give the Owner role. The server applies the
 * same rule; this only keeps the picker honest.
 */
const grantableRoles = (roles, me) => roles.filter((r) => (r.key !== OWNER_ROLE || me.roleKey === OWNER_ROLE)
  && r.permissions.every((p) => me.permissions.includes(p)));

function InviteModal({ roles, onClose, onDone }) {
  const [form, setForm] = useState({ name: '', email: '', roleKey: roles[0]?.key || '' });
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const mutation = useMutation({
    mutationFn: () => invitePlatformUser({ name: form.name.trim(), email: form.email.trim(), roleKey: form.roleKey }),
    onSuccess: (res) => {
      if (res.invite?.sent) toast.success(`Invite sent to ${res.user.email}`);
      else toast.error(`${res.user.email} was added, but the email failed: ${res.invite?.error}. Use “Resend invite”.`);
      onDone();
    },
    onError: (err) => toast.error(platformErrorMessage(err, 'Could not invite')),
  });
  return (
    <Modal title="Invite a platform user" onClose={mutation.isPending ? undefined : onClose}>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={noteBox}>They get an email with a link to set their own password (valid 24 hours).</div>
        <div>
          <label style={labelStyle} htmlFor="pu-name">Name</label>
          <input id="pu-name" value={form.name} onChange={set('name')} required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="pu-email">Email</label>
          <input id="pu-email" type="email" value={form.email} onChange={set('email')} required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="pu-role">Role</label>
          <select id="pu-role" value={form.roleKey} onChange={set('roleKey')} style={inputStyle}>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.displayName}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn onClick={onClose} disabled={mutation.isPending}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={mutation.isPending || !form.roleKey}>
            {mutation.isPending ? 'Sending…' : 'Send invite'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

export default function PlatformUsers() {
  const { user: me } = usePlatformAuth();
  const canManage = usePlatformPermission('platform.users.manage');
  const queryClient = useQueryClient();
  const [inviting, setInviting] = useState(false);

  const users = useQuery({ queryKey: ['platform', 'users'], queryFn: listPlatformUsers });
  const roles = useQuery({ queryKey: ['platform', 'platform-roles'], queryFn: listPlatformRoles });
  const allRoles = roles.data?.roles || [];
  const giveable = me ? grantableRoles(allRoles, me) : [];
  const giveableKeys = new Set(giveable.map((r) => r.key));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['platform', 'users'] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'platform-roles'] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'audit'] });
  };
  const onError = (fallback) => (err) => toast.error(platformErrorMessage(err, fallback));

  const changeRole = useMutation({
    mutationFn: ({ id, roleKey }) => changePlatformUserRole(id, roleKey),
    onSuccess: () => { toast.success('Role changed'); refresh(); },
    onError: onError('Could not change the role'),
  });
  const setActive = useMutation({
    mutationFn: ({ id, active }) => (active ? reactivatePlatformUser(id) : deactivatePlatformUser(id)),
    onSuccess: (res) => { toast.success(res.user.isActive ? 'Reactivated' : 'Deactivated'); refresh(); },
    onError: onError('Could not change this user'),
  });
  const resend = useMutation({
    mutationFn: (id) => resendPlatformInvite(id),
    onSuccess: (res) => toast.success(`Invite sent to ${res.invite.email}`),
    onError: onError('Could not send the invite'),
  });

  // You may act on someone else whose current role you could give.
  const canActOn = (u) => canManage && me && String(u._id) !== String(me._id) && giveableKeys.has(u.roleKey);
  const activeOwners = (users.data?.users || []).filter((u) => u.roleKey === OWNER_ROLE && u.isActive).length;

  return (
    <div>
      <PageHeader
        title="Platform users"
        subtitle="LogiForce staff who can sign in to this console"
        action={canManage && giveable.length > 0 && <Btn variant="primary" onClick={() => setInviting(true)}>Invite user</Btn>}
      />
      {users.error && <div style={{ ...errorBox, marginBottom: 14 }}>{platformErrorMessage(users.error, 'Could not load platform users')}</div>}
      <Card style={{ padding: 0, overflowX: 'auto' }}>
        {users.isLoading ? <LoadingSpinner /> : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Last sign-in</th>
                {canManage && <th style={thStyle} />}
              </tr>
            </thead>
            <tbody>
              {(users.data?.users || []).map((u) => {
                const mine = me && String(u._id) === String(me._id);
                const actionable = canActOn(u);
                const lastOwner = u.roleKey === OWNER_ROLE && u.isActive && activeOwners <= 1;
                return (
                  <tr key={u._id}>
                    <td style={tdStyle}>{u.name}{mine && <span style={{ color: 'var(--text3)' }}> (you)</span>}</td>
                    <td style={tdStyle}>{u.email}</td>
                    <td style={tdStyle}>
                      {actionable && !lastOwner ? (
                        <select
                          aria-label={`Role of ${u.email}`}
                          value={u.roleKey}
                          disabled={changeRole.isPending}
                          onChange={(e) => changeRole.mutate({ id: u._id, roleKey: e.target.value })}
                          style={{ ...inputStyle, height: 30, width: 'auto' }}
                        >
                          {giveable.map((r) => <option key={r.key} value={r.key}>{r.displayName}</option>)}
                        </select>
                      ) : (
                        <Badge variant={u.roleKey === OWNER_ROLE ? 'purple' : 'default'}>{u.roleName || u.roleKey}</Badge>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {!u.isActive ? <Badge>inactive</Badge>
                        : u.invitePending ? <Badge variant="info">invited</Badge>
                          : <Badge variant="success">active</Badge>}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text2)' }}>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</td>
                    {canManage && (
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {actionable && u.isActive && u.invitePending && (
                          <Btn small disabled={resend.isPending} onClick={() => resend.mutate(u._id)}>Resend invite</Btn>
                        )}
                        {actionable && !lastOwner && (
                          <Btn
                            small
                            style={{ marginLeft: 6 }}
                            variant={u.isActive ? 'danger' : 'success'}
                            disabled={setActive.isPending}
                            onClick={() => {
                              if (!u.isActive || window.confirm(`Deactivate ${u.email}? They are signed out at once.`)) {
                                setActive.mutate({ id: u._id, active: !u.isActive });
                              }
                            }}
                          >
                            {u.isActive ? 'Deactivate' : 'Reactivate'}
                          </Btn>
                        )}
                        {lastOwner && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Last active Owner</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {inviting && (
        <InviteModal
          roles={giveable}
          onClose={() => setInviting(false)}
          onDone={() => { setInviting(false); refresh(); }}
        />
      )}
    </div>
  );
}
