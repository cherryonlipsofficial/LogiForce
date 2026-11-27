import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { createTenant, getPlatformMeta, listRoleTemplates } from '../api/platformApi';
import { platformErrorMessage } from '../api/platformAxios';
import Modal from '../../components/ui/Modal';
import Btn from '../../components/ui/Btn';
import { inputStyle, labelStyle, errorBox, noteBox } from '../components/styles';
import { tenantUrl } from '../../config/appDomain';

// Same rule as the server (platform/models/Tenant.js): a lowercase letter, then
// 2–30 lowercase letters, digits or hyphens. The server also refuses reserved keys.
const KEY_PATTERN = /^[a-z][a-z0-9-]{2,30}$/;

const Checkbox = ({ checked, onChange, disabled, children, hint }) => (
  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1 }}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} />
    <span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)' }}>{hint}</span>}
    </span>
  </label>
);

export default function NewCompanyModal({ onClose }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: meta } = useQuery({ queryKey: ['platform', 'meta'], queryFn: getPlatformMeta, staleTime: Infinity });
  const { data: tpl } = useQuery({ queryKey: ['platform', 'role-templates'], queryFn: listRoleTemplates });

  const [form, setForm] = useState({ key: '', name: '', adminName: '', adminEmail: '' });
  const [modules, setModules] = useState(null); // null = "all optional modules" until touched
  const [roleKeys, setRoleKeys] = useState(null); // null = every assignable template
  const [failure, setFailure] = useState(null);

  const adminKey = meta?.tenantAdminTemplateKey || 'tenant_admin';
  const optionalModules = (meta?.modules || []).filter((m) => !(meta?.coreModules || []).includes(m));
  const templates = (tpl?.templates || []).filter((t) => !t.retired);
  const chosenModules = modules ?? optionalModules;
  const chosenRoles = roleKeys ?? templates.map((t) => t.key);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: field === 'key' ? e.target.value.toLowerCase() : e.target.value }));
  const toggleIn = (list, value, on) => (on ? [...new Set([...list, value])] : list.filter((v) => v !== value));

  const keyProblem = form.key && !KEY_PATTERN.test(form.key)
    ? '3–31 characters: a lowercase letter, then lowercase letters, digits or hyphens' : '';

  const mutation = useMutation({
    mutationFn: () => createTenant({
      key: form.key.trim(),
      name: form.name.trim(),
      adminName: form.adminName.trim(),
      adminEmail: form.adminEmail.trim(),
      enabledModules: chosenModules,
      roleTemplateKeys: [...new Set([adminKey, ...chosenRoles])],
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'audit'] });
      const invite = res.admin?.invite;
      toast.success(invite?.sent ? `${res.tenant.name} is ready. Invite sent to ${invite.email}.` : `${res.tenant.name} is ready.`);
      onClose();
      navigate(`/platform/companies/${res.tenant.key}`);
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
      const body = err?.response?.data;
      setFailure({ message: platformErrorMessage(err, 'Could not create the company'), errors: body?.errors, retryable: body?.retryable });
    },
  });

  const canSubmit = form.key && !keyProblem && form.name.trim() && form.adminName.trim() && form.adminEmail.trim() && !mutation.isPending;

  return (
    <Modal title="New company" width={620} onClose={mutation.isPending ? undefined : onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); setFailure(null); mutation.mutate(); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="nc-key">Key (subdomain)</label>
            <input id="nc-key" value={form.key} onChange={set('key')} required placeholder="acme" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} />
            <div style={{ fontSize: 11, color: keyProblem ? '#f87171' : 'var(--text3)', marginTop: 4 }}>
              {keyProblem || (form.key ? (tenantUrl(form.key) || form.key) : 'Cannot be changed later')}
            </div>
          </div>
          <div>
            <label style={labelStyle} htmlFor="nc-name">Company name</label>
            <input id="nc-name" value={form.name} onChange={set('name')} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="nc-admin-name">Admin name</label>
            <input id="nc-admin-name" value={form.adminName} onChange={set('adminName')} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="nc-admin-email">Admin email</label>
            <input id="nc-admin-email" type="email" value={form.adminEmail} onChange={set('adminEmail')} required style={inputStyle} />
          </div>
        </div>

        <div>
          <div style={labelStyle}>Modules</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
            Always on: {(meta?.coreModules || []).join(', ') || '—'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
            {optionalModules.map((m) => (
              <Checkbox key={m} checked={chosenModules.includes(m)} onChange={(on) => setModules(toggleIn(chosenModules, m, on))}>{m}</Checkbox>
            ))}
          </div>
        </div>

        <div>
          <div style={labelStyle}>Allowed roles</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
            {templates.map((t) => (
              <Checkbox
                key={t.key}
                checked={t.key === adminKey || chosenRoles.includes(t.key)}
                disabled={t.key === adminKey}
                hint={t.key === adminKey ? 'Every company has it' : undefined}
                onChange={(on) => setRoleKeys(toggleIn(chosenRoles, t.key, on))}
              >
                {t.displayName}
              </Checkbox>
            ))}
          </div>
        </div>

        <div style={noteBox}>
          Creates the company&apos;s database, its roles, and the admin user, then emails the admin a link to set a password.
        </div>

        {failure && (
          <div style={errorBox}>
            {failure.message}
            {failure.errors && (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {Object.entries(failure.errors).map(([k, v]) => <li key={k}>{v}</li>)}
              </ul>
            )}
            {failure.retryable && <div style={{ marginTop: 6 }}>Fix the cause and press Create again to resume.</div>}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn onClick={onClose} disabled={mutation.isPending}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={!canSubmit}>{mutation.isPending ? 'Creating…' : 'Create company'}</Btn>
        </div>
      </form>
    </Modal>
  );
}
