import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  getTenant, getPlatformMeta, listRoleTemplates, updateTenant,
  suspendTenant, reactivateTenant, archiveTenant, resyncTenantRoles, resendTenantInvite,
  inviteTenantAdmin, resetTenantAdminPassword,
} from '../api/platformApi';
import { platformErrorMessage } from '../api/platformAxios';
import { usePlatformCan } from '../hooks/usePlatformPermission';
import Card from '../../components/ui/Card';
import Btn from '../../components/ui/Btn';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Toggle from '../components/Toggle';
import TenantStatusBadge from '../components/TenantStatusBadge';
import {
  sectionTitle, inputStyle, labelStyle, tableStyle, thStyle, tdStyle,
  errorBox, noteBox, okBox, formatDate, formatDateTime,
} from '../components/styles';

const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));

/** What the last role sync did, in one box. */
function RoleSyncResult({ result }) {
  if (!result) return null;
  if (!result.ok) {
    return <div style={errorBox}>The change was saved, but copying roles into the company failed: {result.error}. Use “Re-run role sync”.</div>;
  }
  const parts = [
    result.created?.length && `created ${result.created.join(', ')}`,
    result.updated?.length && `updated ${result.updated.join(', ')}`,
    result.deactivated?.length && `switched off ${result.deactivated.join(', ')}`,
  ].filter(Boolean);
  return (
    <div style={result.conflicts?.length ? errorBox : okBox}>
      Roles synced{parts.length ? `: ${parts.join('; ')}` : ' (no changes)'}.
      {result.usersOnDeactivatedRoles > 0 && ` ${result.usersOnDeactivatedRoles} user(s) are on a role that is now switched off and have no role permissions until they get a new role.`}
      {result.conflicts?.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {result.conflicts.map((c) => <li key={`${c.templateKey}-${c.roleName}`}>{c.templateKey}: {c.reason}</li>)}
        </ul>
      )}
    </div>
  );
}

const STATUS_ACTIONS = {
  suspend: {
    title: (t) => `Suspend ${t.name}?`,
    text: 'Nobody at this company can use LogiForce while it is suspended: every request is refused and its nightly jobs stop. Nothing is deleted.',
    button: 'Suspend', variant: 'danger', run: suspendTenant, done: (t) => `${t.name} is suspended`,
  },
  archive: {
    title: (t) => `Archive ${t.name}?`,
    text: 'An archived company is closed: its users are refused and its jobs stop. All its data is kept, and it can be reactivated later. Companies are never deleted.',
    button: 'Archive', variant: 'danger', run: archiveTenant, done: (t) => `${t.name} is archived`,
  },
  reactivate: {
    title: (t) => `Reactivate ${t.name}?`,
    text: 'The company’s users can sign in and work again.',
    button: 'Reactivate', variant: 'success', run: reactivateTenant, done: (t) => `${t.name} is active again`,
  },
};

/** Suspend / archive / reactivate with an optional reason for the audit log. */
function StatusModal({ tenant, action, onClose, onDone }) {
  const cfg = STATUS_ACTIONS[action];
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => cfg.run(tenant.key, reason),
    onSuccess: (res) => {
      toast.success(cfg.done(tenant));
      onDone(res);
    },
    onError: (err) => toast.error(platformErrorMessage(err)),
  });
  return (
    <Modal title={cfg.title(tenant)} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{cfg.text}</div>
        <div>
          <label style={labelStyle} htmlFor="status-reason">Reason (for the audit log)</label>
          <input id="status-reason" value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle} maxLength={500} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant={cfg.variant} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? '…' : cfg.button}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/** Add another company admin; they get a set-password link by email. */
function InviteAdminModal({ tenant, onClose, onDone }) {
  const [form, setForm] = useState({ name: '', email: '' });
  const mutation = useMutation({
    mutationFn: () => inviteTenantAdmin(tenant.key, { name: form.name.trim(), email: form.email.trim() }),
    onSuccess: (res) => {
      if (res.invite?.sent) toast.success(`Invite sent to ${res.admin.email}`);
      else toast.error(`${res.admin.email} was added, but the email failed: ${res.invite?.error}. Use “Resend invite”.`);
      onDone();
    },
    onError: (err) => toast.error(platformErrorMessage(err, 'Could not invite the admin')),
  });
  return (
    <Modal title={`Invite an admin to ${tenant.name}`} onClose={mutation.isPending ? undefined : onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          The new admin is added on the Company Admin role and emailed a link to set their own password.
        </div>
        <div>
          <label style={labelStyle} htmlFor="ia-name">Name</label>
          <input id="ia-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="ia-email">Email</label>
          <input id="ia-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required style={inputStyle} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn onClick={onClose} disabled={mutation.isPending}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={mutation.isPending || !form.name.trim() || !form.email.trim()}>
            {mutation.isPending ? 'Sending…' : 'Send invite'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

const detailsFrom = (t) => ({
  name: t.name || '',
  contactName: t.contact?.name || '',
  contactEmail: t.contact?.email || '',
  contactPhone: t.contact?.phone || '',
  maxUsers: t.limits?.maxUsers == null ? '' : String(t.limits.maxUsers),
  allowSelfSignup: t.allowSelfSignup === true,
});

/** Name, contact, user limit and self sign-up (platform.tenants.edit). */
function DetailsCard({ tenant, canEdit, onSaved }) {
  const saved = detailsFrom(tenant);
  const [draft, setDraft] = useState(null);
  const form = draft ?? saved;
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = (field) => (e) => setDraft({ ...form, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const mutation = useMutation({
    mutationFn: () => updateTenant(tenant.key, {
      name: form.name.trim(),
      contact: { name: form.contactName.trim(), email: form.contactEmail.trim(), phone: form.contactPhone.trim() },
      limits: { maxUsers: form.maxUsers === '' ? null : Number(form.maxUsers) },
      allowSelfSignup: form.allowSelfSignup,
    }),
    onSuccess: (res) => {
      setDraft(null);
      toast.success(res.changed.length ? 'Saved' : 'Nothing to change');
      onSaved(res);
    },
    onError: (err) => toast.error(platformErrorMessage(err, 'Could not save')),
  });

  const field = (id, label, key, props = {}) => (
    <div>
      <label style={labelStyle} htmlFor={id}>{label}</label>
      <input id={id} value={form[key]} onChange={set(key)} disabled={!canEdit} style={inputStyle} {...props} />
    </div>
  );

  return (
    <Card>
      <div style={sectionTitle}>Details</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {field('cd-name', 'Company name', 'name')}
        {field('cd-contact-name', 'Contact name', 'contactName')}
        {field('cd-contact-email', 'Contact email', 'contactEmail', { type: 'email' })}
        {field('cd-contact-phone', 'Contact phone', 'contactPhone')}
        {field('cd-max-users', 'User limit (empty = none)', 'maxUsers', { type: 'number', min: 1, step: 1 })}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, alignSelf: 'end', paddingBottom: 8 }}>
          <input type="checkbox" checked={form.allowSelfSignup} onChange={set('allowSelfSignup')} disabled={!canEdit} style={{ width: 'auto', flex: 'none', margin: 0 }} />
          Allow self sign-up
        </label>
      </div>
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Btn variant="primary" disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Saving…' : 'Save details'}
          </Btn>
          {dirty && <Btn onClick={() => setDraft(null)}>Discard</Btn>}
        </div>
      )}
    </Card>
  );
}

export default function CompanyDetail() {
  const { key } = useParams();
  const can = usePlatformCan();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({ queryKey: ['platform', 'tenant', key], queryFn: () => getTenant(key) });
  const { data: meta } = useQuery({ queryKey: ['platform', 'meta'], queryFn: getPlatformMeta, staleTime: Infinity });
  const { data: tpl } = useQuery({ queryKey: ['platform', 'role-templates'], queryFn: listRoleTemplates });

  // Unsaved edits; null = show what is saved.
  const [modulesDraft, setModulesDraft] = useState(null);
  const [rolesDraft, setRolesDraft] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [statusAction, setStatusAction] = useState(null);
  const [inviting, setInviting] = useState(false);

  const tenant = data?.tenant;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['platform', 'tenant', key] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'role-templates'] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'audit'] });
  };

  const save = useMutation({
    mutationFn: (body) => updateTenant(key, body),
    onSuccess: (res) => {
      setModulesDraft(null);
      setRolesDraft(null);
      setSyncResult(res.roleSync);
      queryClient.setQueryData(['platform', 'tenant', key], (old) => (old ? { ...old, tenant: { ...old.tenant, ...res.tenant } } : old));
      refresh();
      toast.success(res.changed.length ? 'Saved' : 'Nothing to change');
    },
    onError: (err) => toast.error(platformErrorMessage(err, 'Could not save')),
  });

  const resync = useMutation({
    mutationFn: () => resyncTenantRoles(key),
    onSuccess: (res) => { setSyncResult(res.roleSync); refresh(); },
    onError: (err) => toast.error(platformErrorMessage(err)),
  });

  const invite = useMutation({
    mutationFn: (email) => resendTenantInvite(key, email),
    onSuccess: (res) => { toast.success(`Invite sent to ${res.invite.email}`); refresh(); },
    onError: (err) => toast.error(platformErrorMessage(err, 'Could not send the invite')),
  });

  const resetPassword = useMutation({
    mutationFn: (email) => resetTenantAdminPassword(key, email),
    onSuccess: (res) => { toast.success(`Password reset link sent to ${res.invite.email}`); refresh(); },
    onError: (err) => toast.error(platformErrorMessage(err, 'Could not send the reset link')),
  });

  const applyTenant = (res) => {
    queryClient.setQueryData(['platform', 'tenant', key], (old) => (old ? { ...old, tenant: { ...old.tenant, ...res.tenant } } : old));
    refresh();
  };

  if (isLoading) return <LoadingSpinner />;
  if (error) return <div style={errorBox}>{platformErrorMessage(error, 'Could not load this company')}</div>;

  // What this user may do; the server checks each request again.
  const inUse = ['active', 'suspended'].includes(tenant.status);
  const editable = can('platform.tenants.manage_modules') && inUse;
  const canEditDetails = can('platform.tenants.edit') && inUse;
  const canChangeStatus = can('platform.tenants.suspend');
  const isActive = tenant.status === 'active';
  const canInvite = can('platform.tenant_admins.invite') && isActive;
  const canResend = can('platform.tenant_admins.resend_invite') && isActive;
  const canReset = can('platform.tenant_admins.reset_password') && isActive;
  const statusButtons = !canChangeStatus ? [] : {
    active: ['suspend', 'archive'],
    suspended: ['reactivate', 'archive'],
    archived: ['reactivate'],
  }[tenant.status] || [];
  const coreModules = meta?.coreModules || [];
  const optionalModules = (meta?.modules || []).filter((m) => !coreModules.includes(m));
  const adminKey = meta?.tenantAdminTemplateKey || 'tenant_admin';
  const templates = (tpl?.templates || []).filter((t) => !t.retired);

  const modules = modulesDraft ?? tenant.enabledModules;
  const roleKeys = rolesDraft ?? tenant.roleTemplateKeys;
  const dirty = !sameSet(modules, tenant.enabledModules) || !sameSet(roleKeys, tenant.roleTemplateKeys);

  const toggleIn = (list, value, on) => (on ? [...new Set([...list, value])] : list.filter((v) => v !== value));

  const submit = () => {
    const body = {};
    if (!sameSet(modules, tenant.enabledModules)) body.enabledModules = modules;
    if (!sameSet(roleKeys, tenant.roleTemplateKeys)) body.roleTemplateKeys = roleKeys;
    save.mutate(body);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link to="/platform/companies" style={{ fontSize: 12, color: 'var(--text3)' }}>← Companies</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>{tenant.name}</h1>
          <TenantStatusBadge status={tenant.status} />
          <div style={{ flex: 1 }} />
          {statusButtons.map((action) => (
            <Btn key={action} variant={STATUS_ACTIONS[action].variant} onClick={() => setStatusAction(action)}>
              {STATUS_ACTIONS[action].button}
            </Btn>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, lineHeight: 1.7 }}>
          <span style={{ fontFamily: 'var(--mono)' }}>{tenant.key}</span>
          {' · '}<a href={tenant.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{tenant.url}</a>
          {' · '}created {formatDate(tenant.createdAt)}
          {tenant.activeUsers != null && <> · {tenant.activeUsers} active user{tenant.activeUsers === 1 ? '' : 's'}</>}
          {tenant.limits?.maxUsers != null && <> (limit {tenant.limits.maxUsers})</>}
        </div>
      </div>

      {tenant.provisioningError && (
        <div style={errorBox}>
          Provisioning failed at “{tenant.provisioningError.step}”: {tenant.provisioningError.message}.
          {' '}Create the company again with the same key to resume. Until then nobody can use it.
        </div>
      )}
      {tenant.status === 'suspended' && <div style={noteBox}>This company is suspended. Its users can&apos;t sign in.</div>}
      {tenant.status === 'archived' && <div style={noteBox}>This company is archived. Its users can&apos;t sign in; its data is kept.</div>}

      <DetailsCard key={`${tenant.updatedAt}`} tenant={tenant} canEdit={canEditDetails} onSaved={applyTenant} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
        {/* Modules */}
        <Card>
          <div style={sectionTitle}>Modules</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
            Switching a module off removes its permissions from everyone at the company, admins included.
          </div>
          {coreModules.map((m) => (
            <div key={m} style={rowStyle}>
              <span>{m} <Badge style={{ marginLeft: 6, fontSize: 10 }}>always on</Badge></span>
              <Toggle on disabled label={m} size="small" />
            </div>
          ))}
          {optionalModules.map((m) => (
            <div key={m} style={rowStyle}>
              <span>{m}</span>
              <Toggle
                size="small"
                label={m}
                on={modules.includes(m)}
                disabled={!editable}
                onChange={(on) => setModulesDraft(toggleIn(modules, m, on))}
              />
            </div>
          ))}
        </Card>

        {/* Allowed roles */}
        <Card>
          <div style={sectionTitle}>Allowed roles</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
            Roles the company&apos;s admins can give their users. Unticking one switches it off at the company.
          </div>
          {templates.map((t) => {
            const locked = t.key === adminKey;
            return (
              <label key={t.key} style={{ ...rowStyle, cursor: editable && !locked ? 'pointer' : 'default' }}>
                <span>
                  {t.displayName}
                  <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginLeft: 6 }}>{t.key}</span>
                  {locked && <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)' }}>Every company has it</span>}
                </span>
                <input
                  type="checkbox"
                  checked={locked || roleKeys.includes(t.key)}
                  disabled={!editable || locked}
                  onChange={(e) => setRolesDraft(toggleIn(roleKeys, t.key, e.target.checked))}
                />
              </label>
            );
          })}
        </Card>
      </div>

      {editable && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Btn variant="primary" disabled={!dirty || save.isPending} onClick={submit}>
            {save.isPending ? 'Saving…' : 'Save modules and roles'}
          </Btn>
          {dirty && <Btn onClick={() => { setModulesDraft(null); setRolesDraft(null); }}>Discard</Btn>}
          <div style={{ flex: 1 }} />
          <Btn small disabled={resync.isPending} onClick={() => resync.mutate()}>
            {resync.isPending ? 'Syncing…' : 'Re-run role sync'}
          </Btn>
        </div>
      )}
      <RoleSyncResult result={syncResult} />

      {/* Admins */}
      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px 8px', gap: 8 }}>
          <div style={{ ...sectionTitle, marginBottom: 0 }}>Company admins</div>
          <div style={{ flex: 1 }} />
          {canResend && tenant.adminEmail && (
            <Btn small disabled={invite.isPending} onClick={() => invite.mutate(undefined)}>
              Resend invite to {tenant.adminEmail}
            </Btn>
          )}
          {canInvite && <Btn small variant="primary" onClick={() => setInviting(true)}>Invite admin</Btn>}
        </div>
        {data.adminsError ? (
          <div style={{ ...errorBox, margin: '0 20px 16px' }}>Could not read the company&apos;s database: {data.adminsError}</div>
        ) : data.admins?.length === 0 ? (
          <div style={{ padding: '4px 20px 16px', fontSize: 12, color: 'var(--text3)' }}>No users on the Company Admin role.</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Last sign-in</th>
                {(canResend || canReset) && <th style={thStyle} />}
              </tr>
            </thead>
            <tbody>
              {(data.admins || []).map((a) => (
                <tr key={a._id}>
                  <td style={tdStyle}>{a.name}</td>
                  <td style={tdStyle}>{a.email}</td>
                  <td style={tdStyle}><Badge variant={a.isActive ? 'success' : 'default'}>{a.isActive ? 'active' : 'inactive'}</Badge></td>
                  <td style={{ ...tdStyle, color: 'var(--text2)' }}>{a.lastLogin ? formatDateTime(a.lastLogin) : 'Never'}</td>
                  {(canResend || canReset) && (
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canResend && a.isActive && !a.lastLogin && (
                        <Btn small disabled={invite.isPending} onClick={() => invite.mutate(a.email)}>Resend invite</Btn>
                      )}
                      {canReset && a.isActive && (
                        <Btn
                          small
                          style={{ marginLeft: 6 }}
                          disabled={resetPassword.isPending}
                          onClick={() => {
                            if (window.confirm(`Email ${a.email} a link to set a new password?`)) resetPassword.mutate(a.email);
                          }}
                        >
                          Reset password
                        </Btn>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {statusAction && (
        <StatusModal
          tenant={tenant}
          action={statusAction}
          onClose={() => setStatusAction(null)}
          onDone={(res) => {
            setStatusAction(null);
            applyTenant(res);
          }}
        />
      )}
      {inviting && (
        <InviteAdminModal
          tenant={tenant}
          onClose={() => setInviting(false)}
          onDone={() => { setInviting(false); refresh(); }}
        />
      )}
    </div>
  );
}

const rowStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13,
};
