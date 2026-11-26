import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  getTenant, getPlatformMeta, listRoleTemplates, updateTenant,
  suspendTenant, reactivateTenant, resyncTenantRoles, resendTenantInvite,
} from '../api/platformApi';
import { platformErrorMessage } from '../api/platformAxios';
import { usePlatformAuth } from '../auth/platformAuthContext';
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

/** Suspend / reactivate with an optional reason for the audit log. */
function StatusModal({ tenant, onClose, onDone }) {
  const suspending = tenant.status === 'active';
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => (suspending ? suspendTenant(tenant.key, reason) : reactivateTenant(tenant.key, reason)),
    onSuccess: (res) => {
      toast.success(suspending ? `${tenant.name} is suspended` : `${tenant.name} is active again`);
      onDone(res);
    },
    onError: (err) => toast.error(platformErrorMessage(err)),
  });
  return (
    <Modal title={suspending ? `Suspend ${tenant.name}?` : `Reactivate ${tenant.name}?`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          {suspending
            ? 'Nobody at this company can use LogiForce while it is suspended: every request is refused and its nightly jobs stop. Nothing is deleted.'
            : 'The company’s users can sign in and work again.'}
        </div>
        <div>
          <label style={labelStyle} htmlFor="status-reason">Reason (for the audit log)</label>
          <input id="status-reason" value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle} maxLength={500} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant={suspending ? 'danger' : 'success'} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? '…' : suspending ? 'Suspend' : 'Reactivate'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

export default function CompanyDetail() {
  const { key } = useParams();
  const { isOwner } = usePlatformAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({ queryKey: ['platform', 'tenant', key], queryFn: () => getTenant(key) });
  const { data: meta } = useQuery({ queryKey: ['platform', 'meta'], queryFn: getPlatformMeta, staleTime: Infinity });
  const { data: tpl } = useQuery({ queryKey: ['platform', 'role-templates'], queryFn: listRoleTemplates });

  // Unsaved edits; null = show what is saved.
  const [modulesDraft, setModulesDraft] = useState(null);
  const [rolesDraft, setRolesDraft] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [statusModal, setStatusModal] = useState(false);

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

  if (isLoading) return <LoadingSpinner />;
  if (error) return <div style={errorBox}>{platformErrorMessage(error, 'Could not load this company')}</div>;

  const editable = isOwner && ['active', 'suspended'].includes(tenant.status);
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
          {isOwner && ['active', 'suspended'].includes(tenant.status) && (
            <Btn variant={tenant.status === 'active' ? 'danger' : 'success'} onClick={() => setStatusModal(true)}>
              {tenant.status === 'active' ? 'Suspend' : 'Reactivate'}
            </Btn>
          )}
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
          {' '}Create the company again with the same key to resume.
        </div>
      )}
      {tenant.status === 'suspended' && <div style={noteBox}>This company is suspended. Its users can&apos;t sign in.</div>}

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
          {isOwner && tenant.status === 'active' && tenant.adminEmail && (
            <Btn small disabled={invite.isPending} onClick={() => invite.mutate(undefined)}>
              Resend invite to {tenant.adminEmail}
            </Btn>
          )}
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
                {isOwner && <th style={thStyle} />}
              </tr>
            </thead>
            <tbody>
              {(data.admins || []).map((a) => (
                <tr key={a._id}>
                  <td style={tdStyle}>{a.name}</td>
                  <td style={tdStyle}>{a.email}</td>
                  <td style={tdStyle}><Badge variant={a.isActive ? 'success' : 'default'}>{a.isActive ? 'active' : 'inactive'}</Badge></td>
                  <td style={{ ...tdStyle, color: 'var(--text2)' }}>{a.lastLogin ? formatDateTime(a.lastLogin) : 'Never'}</td>
                  {isOwner && (
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {tenant.status === 'active' && (
                        <Btn small disabled={invite.isPending} onClick={() => invite.mutate(a.email)}>Resend invite</Btn>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {statusModal && (
        <StatusModal
          tenant={tenant}
          onClose={() => setStatusModal(false)}
          onDone={(res) => {
            setStatusModal(false);
            queryClient.setQueryData(['platform', 'tenant', key], (old) => (old ? { ...old, tenant: { ...old.tenant, ...res.tenant } } : old));
            refresh();
          }}
        />
      )}
    </div>
  );
}

const rowStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13,
};
