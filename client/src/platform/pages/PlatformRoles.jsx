import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getPlatformMeta, listRoleTemplates, updateRoleTemplate } from '../api/platformApi';
import { platformErrorMessage } from '../api/platformAxios';
import { usePlatformPermission } from '../hooks/usePlatformPermission';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import Btn from '../../components/ui/Btn';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Toggle from '../components/Toggle';
import { inputStyle, labelStyle, errorBox, okBox, noteBox } from '../components/styles';

const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * The permission grid: one row per permission, grouped by module, with a
 * module-wide switch. Moved here from the company app: companies can only look
 * at roles now; templates are edited on the platform and copied to them.
 */
function PermissionGrid({ byModule, selected, onChange, readOnly, filter }) {
  const [collapsed, setCollapsed] = useState({});
  const q = (filter || '').toLowerCase();

  const modules = useMemo(() => Object.entries(byModule || {}).map(([mod, perms]) => ({
    mod,
    all: perms,
    shown: q
      ? perms.filter((p) => [p.key, p.label, p.description, mod].some((s) => (s || '').toLowerCase().includes(q)))
      : perms,
  })).filter((m) => m.shown.length > 0), [byModule, q]);

  const setMany = (keys, on) => {
    const next = new Set(selected);
    for (const k of keys) (on ? next.add(k) : next.delete(k));
    onChange([...next]);
  };

  return (
    <div>
      {modules.map(({ mod, all, shown }) => {
        const granted = all.filter((p) => selected.includes(p.key)).length;
        const allOn = granted === all.length;
        const someOn = granted > 0 && !allOn;
        const isCollapsed = !q && collapsed[mod]; // filtering shows every match
        return (
          <div key={mod} style={{ marginBottom: 2 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              background: 'var(--surface2)', borderRadius: 8, userSelect: 'none',
            }}>
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [mod]: !c[mod] }))}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flex: 1, color: 'inherit', textAlign: 'left' }}
              >
                <span style={{ fontSize: 10, color: 'var(--text3)', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}>▼</span>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)' }}>{mod}</span>
              </button>
              <button
                type="button"
                disabled={readOnly}
                title={allOn ? `Turn off all ${mod} permissions` : `Turn on all ${mod} permissions`}
                onClick={() => setMany(all.map((p) => p.key), !allOn)}
                style={{
                  width: 16, height: 16, borderRadius: 4, boxSizing: 'border-box', padding: 0,
                  border: `2px solid ${allOn || someOn ? '#4f8ef7' : 'var(--text3)'}`,
                  background: allOn ? '#4f8ef7' : 'transparent', color: '#fff', fontSize: 10, lineHeight: 1,
                  cursor: readOnly ? 'default' : 'pointer',
                }}
              >
                {allOn ? '✓' : someOn ? '—' : ''}
              </button>
              <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 44, textAlign: 'right' }}>{granted} / {all.length}</span>
            </div>
            {!isCollapsed && shown.map((p) => {
              const on = selected.includes(p.key);
              return (
                <div key={p.key} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px 8px 38px',
                  borderBottom: '1px solid var(--border)', opacity: on ? 1 : 0.6,
                }}>
                  <Toggle on={on} disabled={readOnly} label={p.label} onChange={(v) => setMany([p.key], v)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}>{p.label}</div>
                    {p.description && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{p.description}</div>}
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>{p.key}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function SyncResult({ result }) {
  if (!result) return null;
  const { template, sync } = result;
  if (!sync) return <div style={noteBox}>No changes to save.</div>;
  return (
    <div style={sync.failed.length ? errorBox : okBox}>
      Saved {template.displayName} (version {template.version}).
      {' '}Copied to {sync.ok.length} compan{sync.ok.length === 1 ? 'y' : 'ies'}{sync.ok.length ? `: ${sync.ok.join(', ')}` : ''}.
      {sync.failed.length > 0 && (
        <>
          {' '}Failed for {sync.failed.length}; re-run the role sync from each company&apos;s page:
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {sync.failed.map((f) => <li key={f.key}>{f.key}: {f.error}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

export default function PlatformRoles() {
  const canManage = usePlatformPermission('platform.role_templates.manage');
  const { isMobile } = useBreakpoint();
  const queryClient = useQueryClient();
  const { data: meta, isLoading: metaLoading } = useQuery({ queryKey: ['platform', 'meta'], queryFn: getPlatformMeta, staleTime: Infinity });
  const { data, isLoading, error } = useQuery({ queryKey: ['platform', 'role-templates'], queryFn: listRoleTemplates });

  const templates = (data?.templates || []).filter((t) => !t.retired);
  const [selectedKey, setSelectedKey] = useState(null);
  const [draft, setDraft] = useState(null); // unsaved edits of the selected template
  const [filter, setFilter] = useState('');
  const [lastResult, setLastResult] = useState(null);

  const selected = templates.find((t) => t.key === selectedKey) || templates[0];
  const adminKey = meta?.tenantAdminTemplateKey || 'tenant_admin';
  const current = draft ?? (selected && {
    displayName: selected.displayName,
    description: selected.description || '',
    permissions: selected.permissions,
    assignableByTenant: selected.assignableByTenant,
  });
  const dirty = Boolean(selected && draft) && (
    draft.displayName !== selected.displayName
    || draft.description !== (selected.description || '')
    || draft.assignableByTenant !== selected.assignableByTenant
    || !sameSet(draft.permissions, selected.permissions)
  );

  const edit = (patch) => setDraft({ ...current, ...patch });

  const save = useMutation({
    mutationFn: () => {
      const body = { version: selected.version };
      if (draft.displayName !== selected.displayName) body.displayName = draft.displayName;
      if (draft.description !== (selected.description || '')) body.description = draft.description;
      if (draft.assignableByTenant !== selected.assignableByTenant) body.assignableByTenant = draft.assignableByTenant;
      if (!sameSet(draft.permissions, selected.permissions)) body.permissions = draft.permissions;
      return updateRoleTemplate(selected.key, body);
    },
    onSuccess: (res) => {
      setDraft(null);
      setLastResult(res);
      queryClient.invalidateQueries({ queryKey: ['platform', 'role-templates'] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'audit'] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenant'] });
    },
    onError: (err) => {
      toast.error(platformErrorMessage(err, 'Could not save'));
      if (err?.response?.data?.code === 'TEMPLATE_STALE') queryClient.invalidateQueries({ queryKey: ['platform', 'role-templates'] });
    },
  });

  const pick = (key) => {
    if (key === selected?.key) return;
    if (dirty && !window.confirm('Discard your unsaved changes to this role?')) return;
    setDraft(null);
    setLastResult(null);
    setFilter('');
    setSelectedKey(key);
  };

  if (isLoading || metaLoading) return <LoadingSpinner />;
  if (error) return <div style={errorBox}>{platformErrorMessage(error, 'Could not load roles')}</div>;

  const readOnly = !canManage;

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: 'flex-start' }}>
      {/* Template list */}
      <div style={{
        width: isMobile ? '100%' : 260, flexShrink: 0, background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 500 }}>Role templates</div>
        <div style={{ padding: 8 }}>
          {templates.map((t) => {
            const active = t.key === selected?.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => pick(t.key)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 4,
                  borderRadius: 8, cursor: 'pointer', color: 'inherit',
                  background: active ? 'rgba(79,142,247,0.08)' : 'transparent',
                  border: active ? '1px solid rgba(79,142,247,0.4)' : '1px solid transparent',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>{t.displayName}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>{t.key} · v{t.version}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                  {t.permissions.length} permissions · {t.usedBy.length} compan{t.usedBy.length === 1 ? 'y' : 'ies'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor */}
      {selected && current && (
        <div style={{
          flex: 1, minWidth: 0, width: isMobile ? '100%' : undefined, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{selected.key}</span>
              <Badge>version {selected.version}</Badge>
              {selected.key === adminKey && <Badge variant="purple">Company admin</Badge>}
              {readOnly && <Badge>read only</Badge>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div>
                <label style={labelStyle} htmlFor="rt-name">Display name</label>
                <input id="rt-name" value={current.displayName} disabled={readOnly} onChange={(e) => edit({ displayName: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="rt-desc">Description</label>
                <input id="rt-desc" value={current.description} disabled={readOnly} onChange={(e) => edit({ description: e.target.value })} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <Toggle
                on={current.assignableByTenant}
                disabled={readOnly || selected.key === adminKey}
                label="Company admins can assign this role"
                onChange={(v) => edit({ assignableByTenant: v })}
              />
              <span>Company admins can give this role to their users</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              Used by {selected.usedBy.length ? selected.usedBy.join(', ') : 'no companies'}.
              {' '}Saving copies the change to each of them; a company only gets the permissions of modules it has switched on.
            </div>
            {!readOnly && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn variant="primary" disabled={!dirty || save.isPending || !current.displayName.trim()} onClick={() => save.mutate()}>
                  {save.isPending ? 'Saving and syncing…' : 'Save and sync'}
                </Btn>
                {dirty && <Btn onClick={() => setDraft(null)}>Discard</Btn>}
                <span style={{ fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>{current.permissions.length} permissions selected</span>
              </div>
            )}
            <SyncResult result={lastResult} />
          </div>

          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
            <input placeholder="Filter permissions…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...inputStyle, background: 'var(--surface3)' }} />
          </div>
          <div style={{ padding: '8px 12px' }}>
            <PermissionGrid
              byModule={meta?.permissionsByModule}
              selected={current.permissions}
              readOnly={readOnly}
              filter={filter}
              onChange={(permissions) => edit({ permissions })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
