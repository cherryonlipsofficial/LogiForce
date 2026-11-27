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
const RESERVED = ['www', 'api', 'app', 'admin', 'platform', 'mail', 'static', 'cdn', 'status', 'help', 'support', 'docs'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STEPS = ['Company', 'Admin', 'Access', 'Review'];

const Checkbox = ({ checked, onChange, disabled, children, hint }) => (
  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1 }}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} />
    <span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)' }}>{hint}</span>}
    </span>
  </label>
);

const Field = ({ id, label, hint, error, children }) => (
  <div>
    <label style={labelStyle} htmlFor={id}>{label}</label>
    {children}
    {(error || hint) && (
      <div style={{ fontSize: 11, color: error ? '#f87171' : 'var(--text3)', marginTop: 4 }}>{error || hint}</div>
    )}
  </div>
);

const ReviewRow = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
    <div style={{ width: 130, flexShrink: 0, color: 'var(--text3)' }}>{label}</div>
    <div style={{ minWidth: 0, wordBreak: 'break-word' }}>{children}</div>
  </div>
);

/**
 * New company wizard: company → admin → modules, roles and limit → review.
 * Only shown to users with platform.tenants.create; the server checks it too.
 */
export default function NewCompanyModal({ onClose }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: meta } = useQuery({ queryKey: ['platform', 'meta'], queryFn: getPlatformMeta, staleTime: Infinity });
  const { data: tpl } = useQuery({ queryKey: ['platform', 'role-templates'], queryFn: listRoleTemplates });

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    key: '', name: '', contactName: '', contactEmail: '', contactPhone: '', adminName: '', adminEmail: '', maxUsers: '',
  });
  const [modules, setModules] = useState(null); // null = "all optional modules" until touched
  const [roleKeys, setRoleKeys] = useState(null); // null = every template
  const [failure, setFailure] = useState(null);

  const adminKey = meta?.tenantAdminTemplateKey || 'tenant_admin';
  const optionalModules = (meta?.modules || []).filter((m) => !(meta?.coreModules || []).includes(m));
  const templates = (tpl?.templates || []).filter((t) => !t.retired);
  const chosenModules = modules ?? optionalModules;
  const chosenRoles = roleKeys ?? templates.map((t) => t.key);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: field === 'key' ? e.target.value.toLowerCase() : e.target.value }));
  const toggleIn = (list, value, on) => (on ? [...new Set([...list, value])] : list.filter((v) => v !== value));

  const problems = {
    key: !form.key ? 'Required'
      : !KEY_PATTERN.test(form.key) ? '3–31 characters: a lowercase letter, then lowercase letters, digits or hyphens'
        : RESERVED.includes(form.key) ? `"${form.key}" is reserved` : '',
    name: form.name.trim() ? '' : 'Required',
    contactEmail: form.contactEmail.trim() && !EMAIL_PATTERN.test(form.contactEmail.trim()) ? 'Not a valid email' : '',
    adminName: form.adminName.trim() ? '' : 'Required',
    adminEmail: !form.adminEmail.trim() ? 'Required' : !EMAIL_PATTERN.test(form.adminEmail.trim()) ? 'Not a valid email' : '',
    maxUsers: form.maxUsers !== '' && !(Number.isInteger(Number(form.maxUsers)) && Number(form.maxUsers) >= 1)
      ? 'A whole number of at least 1, or empty for no limit' : '',
  };
  const stepFields = [['key', 'name', 'contactEmail'], ['adminName', 'adminEmail'], ['maxUsers'], []];
  const stepValid = (i) => stepFields[i].every((f) => !problems[f]);
  // Show a field's problem once the user has typed in it or tried to move on.
  const [touchedSteps, setTouchedSteps] = useState([]);
  const shown = (field) => {
    const i = stepFields.findIndex((fs) => fs.includes(field));
    return (touchedSteps.includes(i) || (form[field] ?? '') !== '') ? problems[field] : '';
  };

  const mutation = useMutation({
    mutationFn: () => createTenant({
      key: form.key.trim(),
      name: form.name.trim(),
      contact: { name: form.contactName.trim(), email: form.contactEmail.trim(), phone: form.contactPhone.trim() },
      adminName: form.adminName.trim(),
      adminEmail: form.adminEmail.trim(),
      enabledModules: chosenModules,
      roleTemplateKeys: [...new Set([adminKey, ...chosenRoles])],
      limits: { maxUsers: form.maxUsers === '' ? null : Number(form.maxUsers) },
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

  const next = () => {
    setTouchedSteps((t) => [...new Set([...t, step])]);
    if (stepValid(step)) setStep((s) => s + 1);
  };
  const busy = mutation.isPending;

  return (
    <Modal title="New company" width={620} onClose={busy ? undefined : onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length - 1) { next(); return; }
          setFailure(null);
          mutation.mutate();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        {/* Step indicator */}
        <ol style={{ display: 'flex', gap: 6, listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap' }}>
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? 'step' : undefined}
              style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 999,
                background: i === step ? 'rgba(79,142,247,0.15)' : 'var(--surface2)',
                color: i === step ? 'var(--text)' : i < step ? 'var(--text2)' : 'var(--text3)',
                border: '1px solid var(--border)',
              }}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Field id="nc-key" label="Key (subdomain)" error={shown('key')} hint={form.key ? (tenantUrl(form.key) || form.key) : 'Cannot be changed later'}>
              <input id="nc-key" value={form.key} onChange={set('key')} autoFocus placeholder="acme" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} />
            </Field>
            <Field id="nc-name" label="Company name" error={shown('name')}>
              <input id="nc-name" value={form.name} onChange={set('name')} style={inputStyle} />
            </Field>
            <Field id="nc-contact-name" label="Contact name (optional)">
              <input id="nc-contact-name" value={form.contactName} onChange={set('contactName')} style={inputStyle} />
            </Field>
            <Field id="nc-contact-email" label="Contact email (optional)" error={shown('contactEmail')}>
              <input id="nc-contact-email" type="email" value={form.contactEmail} onChange={set('contactEmail')} style={inputStyle} />
            </Field>
            <Field id="nc-contact-phone" label="Contact phone (optional)">
              <input id="nc-contact-phone" value={form.contactPhone} onChange={set('contactPhone')} style={inputStyle} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <>
            <div style={noteBox}>
              This person becomes the company&apos;s first admin. They get an email with a link to set their own
              password; nobody else ever sees it.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <Field id="nc-admin-name" label="Admin name" error={shown('adminName')}>
                <input id="nc-admin-name" value={form.adminName} onChange={set('adminName')} autoFocus style={inputStyle} />
              </Field>
              <Field id="nc-admin-email" label="Admin email" error={shown('adminEmail')}>
                <input id="nc-admin-email" type="email" value={form.adminEmail} onChange={set('adminEmail')} style={inputStyle} />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
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
            <div style={{ maxWidth: 240 }}>
              <Field id="nc-max-users" label="User limit (optional)" error={shown('maxUsers')} hint="Empty means no limit">
                <input id="nc-max-users" type="number" min="1" step="1" value={form.maxUsers} onChange={set('maxUsers')} style={inputStyle} />
              </Field>
            </div>
          </>
        )}

        {step === 3 && (
          <div>
            <ReviewRow label="Key"><span style={{ fontFamily: 'var(--mono)' }}>{form.key}</span> · {tenantUrl(form.key) || '—'}</ReviewRow>
            <ReviewRow label="Name">{form.name.trim()}</ReviewRow>
            <ReviewRow label="Contact">
              {[form.contactName, form.contactEmail, form.contactPhone].map((v) => v.trim()).filter(Boolean).join(' · ') || '—'}
            </ReviewRow>
            <ReviewRow label="Admin">{form.adminName.trim()} &lt;{form.adminEmail.trim()}&gt;</ReviewRow>
            <ReviewRow label="Modules">{[...(meta?.coreModules || []), ...chosenModules].join(', ')}</ReviewRow>
            <ReviewRow label="Allowed roles">
              {templates.filter((t) => t.key === adminKey || chosenRoles.includes(t.key)).map((t) => t.displayName).join(', ')}
            </ReviewRow>
            <ReviewRow label="User limit">{form.maxUsers === '' ? 'No limit' : form.maxUsers}</ReviewRow>
            <div style={{ ...noteBox, marginTop: 12 }}>
              Creates the company&apos;s database, its roles and default settings, and the admin user, then emails the
              admin a link to set a password. The company goes live only when every step succeeds.
            </div>
          </div>
        )}

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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          {step > 0 && <Btn onClick={() => setStep((s) => s - 1)} disabled={busy}>Back</Btn>}
          {step < STEPS.length - 1
            ? <Btn type="submit" variant="primary">Next</Btn>
            : <Btn type="submit" variant="primary" disabled={busy}>{busy ? 'Creating…' : 'Create company'}</Btn>}
        </div>
      </form>
    </Modal>
  );
}
