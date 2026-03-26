import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getRoles, getPermissionsList, createRole, updateRole, deleteRole, duplicateRole } from '../api/rolesApi';
import Modal from '../components/ui/Modal';
import Btn from '../components/ui/Btn';
import Badge from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import EmptyState from '../components/ui/EmptyState';

/* ── helpers ── */
const slugify = (str) =>
  str.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

const colorFromName = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 55%)`;
};

/* ── Toggle Switch ── */
const Toggle = ({ on, onChange, size = 'normal' }) => {
  const w = size === 'small' ? 32 : 36;
  const h = size === 'small' ? 18 : 20;
  const dot = h - 4;
  return (
    <button
      type="button"
      onClick={onChange}
      style={{
        width: w, height: h, borderRadius: h,
        background: on ? '#4f8ef7' : 'var(--surface3)',
        border: 'none', padding: 2, cursor: 'pointer',
        transition: 'background .15s', flexShrink: 0,
        position: 'relative',
      }}
    >
      <div style={{
        width: dot, height: dot, borderRadius: '50%',
        background: '#fff', transition: 'transform .15s',
        transform: on ? `translateX(${w - dot - 4}px)` : 'translateX(0)',
      }} />
    </button>
  );
};

/* ══════════════════════════════════════════
   Permission Matrix (shared by page + modal)
   ══════════════════════════════════════════ */
const PermissionMatrix = ({ byModule, localPermissions, onToggle, onToggleModule, searchFilter, maxHeight }) => {
  const [collapsed, setCollapsed] = useState({});
  const lowerFilter = (searchFilter || '').toLowerCase();

  const filteredModules = useMemo(() => {
    if (!byModule) return [];
    return Object.entries(byModule).map(([mod, perms]) => {
      const filtered = lowerFilter
        ? perms.filter(p =>
            p.key.toLowerCase().includes(lowerFilter) ||
            p.label.toLowerCase().includes(lowerFilter) ||
            (p.description || '').toLowerCase().includes(lowerFilter) ||
            mod.toLowerCase().includes(lowerFilter)
          )
        : perms;
      return { mod, perms: filtered, allPerms: perms };
    }).filter(m => m.perms.length > 0);
  }, [byModule, lowerFilter]);

  // Auto-expand when filtering
  useEffect(() => {
    if (lowerFilter) setCollapsed({});
  }, [lowerFilter]);

  return (
    <div style={{ maxHeight, overflowY: 'auto' }}>
      {filteredModules.map(({ mod, perms, allPerms }) => {
        const granted = allPerms.filter(p => localPermissions.includes(p.key)).length;
        const total = allPerms.length;
        const isCollapsed = collapsed[mod];
        const allOn = granted === total;
        const someOn = granted > 0 && granted < total;

        return (
          <div key={mod} style={{ marginBottom: 2 }}>
            {/* Module header */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', background: 'var(--surface2)',
                borderRadius: 8, cursor: 'pointer', userSelect: 'none',
              }}
              onClick={() => setCollapsed(c => ({ ...c, [mod]: !c[mod] }))}
            >
              <span style={{
                fontSize: 10, color: 'var(--text3)', transition: 'transform .15s',
                transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              }}>
                &#9660;
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--text2)', flex: 1,
              }}>
                {mod}
              </span>
              {/* Module toggle */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleModule(mod, allPerms.map(p => p.key), allOn || someOn); }}
                style={{
                  width: 16, height: 16, borderRadius: 4,
                  border: '2px solid ' + (allOn ? '#4f8ef7' : someOn ? '#4f8ef7' : 'var(--text3)'),
                  background: allOn ? '#4f8ef7' : 'transparent',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: '#fff', lineHeight: 1, padding: 0,
                }}
              >
                {allOn ? '\u2713' : someOn ? '\u2014' : ''}
              </button>
              <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 40, textAlign: 'right' }}>
                {granted} / {total}
              </span>
            </div>

            {/* Permission rows */}
            {!isCollapsed && perms.map(p => {
              const isOn = localPermissions.includes(p.key);
              return (
                <div
                  key={p.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 12px 8px 38px',
                    borderBottom: '1px solid var(--border)',
                    opacity: isOn ? 1 : 0.55,
                    transition: 'opacity .15s',
                  }}
                >
                  <Toggle on={isOn} onChange={() => onToggle(p.key)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{p.label}</div>
                    {p.description && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{p.description}</div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)',
                    opacity: 0.6, flexShrink: 0,
                  }}>
                    {p.key}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/* ══════════════════════════════════════════
   Create Role Modal
   ══════════════════════════════════════════ */
const CreateRoleModal = ({ onClose, roles, permissionsList }) => {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedPermissions, setSelectedPermissions] = useState([]);

  const { mutate: doCreate, isLoading } = useMutation({
    mutationFn: (data) => createRole(data),
    onSuccess: () => {
      toast.success('Role created successfully');
      qc.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to create role'),
  });

  const slug = slugify(name || displayName);

  // Template options from existing roles
  const templates = useMemo(() => {
    const list = [{ label: 'Blank', permissions: [], count: 0 }];
    if (roles) {
      roles.forEach(r => {
        list.push({
          label: `Copy: ${r.displayName || r.name}`,
          permissions: [...(r.permissions || [])],
          count: (r.permissions || []).length,
        });
      });
    }
    return list;
  }, [roles]);

  const handleSelectTemplate = (idx) => {
    setSelectedTemplate(idx);
    setSelectedPermissions([...templates[idx].permissions]);
  };

  const handleToggle = useCallback((key) => {
    setSelectedPermissions(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }, []);

  const handleToggleModule = useCallback((mod, keys, wasOn) => {
    setSelectedPermissions(prev => {
      const s = new Set(prev);
      keys.forEach(k => wasOn ? s.delete(k) : s.add(k));
      return [...s];
    });
  }, []);

  const canProceed = slug && displayName.trim();

  return (
    <Modal title="Create new role" width={520} onClose={onClose}>
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[1, 2].map(s => (
          <button
            key={s}
            type="button"
            onClick={() => s === 1 ? setStep(1) : (canProceed && setStep(2))}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: step === s ? 'rgba(79,142,247,0.15)' : 'var(--surface3)',
              color: step === s ? '#4f8ef7' : 'var(--text3)',
            }}
          >
            {s} — {s === 1 ? 'Details' : 'Permissions'}
          </button>
        ))}
      </div>

      {step === 1 ? (
        <div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Display name *</label>
            <input
              style={inputStyle}
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); if (!name) setName(e.target.value); }}
              placeholder="Senior Accountant"
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Role slug *</label>
            <input
              style={inputStyle}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="senior_accountant"
            />
            {name && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                Will be saved as: {slug}
              </div>
            )}
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Description</label>
            <textarea
              style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, 200))}
              placeholder="Optional description..."
              maxLength={200}
            />
            <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'right', marginTop: 2 }}>
              {description.length}/200
            </div>
          </div>

          {/* Templates */}
          <label style={labelStyle}>Start from a template</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {templates.map((t, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectTemplate(idx)}
                style={{
                  padding: '8px 12px', borderRadius: 8, fontSize: 11,
                  border: selectedTemplate === idx
                    ? '1px solid rgba(79,142,247,0.5)'
                    : '1px solid var(--border2)',
                  background: selectedTemplate === idx
                    ? 'rgba(79,142,247,0.08)'
                    : 'var(--surface2)',
                  color: selectedTemplate === idx ? '#4f8ef7' : 'var(--text2)',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 500 }}>{t.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                  {t.count} permissions
                </div>
              </button>
            ))}
          </div>

          <Btn
            variant="primary"
            disabled={!canProceed}
            onClick={() => setStep(2)}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Next: Configure permissions &rarr;
          </Btn>
        </div>
      ) : (
        <div>
          {permissionsList?.byModule && (
            <>
              <PermissionMatrix
                byModule={permissionsList.byModule}
                localPermissions={selectedPermissions}
                onToggle={handleToggle}
                onToggleModule={handleToggleModule}
                maxHeight={460}
              />
              <div style={{
                fontSize: 12, color: 'var(--text2)', padding: '10px 0',
                borderTop: '1px solid var(--border)', marginTop: 8,
              }}>
                {selectedPermissions.length} permissions selected
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Btn onClick={() => setStep(1)}>&larr; Back</Btn>
            <Btn
              variant="primary"
              disabled={isLoading}
              onClick={() => doCreate({
                name: slug,
                displayName: displayName.trim(),
                description: description.trim(),
                permissions: selectedPermissions,
              })}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {isLoading ? 'Creating...' : 'Create role'}
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
};

/* ══════════════════════════════════════════
   Edit Role Details Modal
   ══════════════════════════════════════════ */
const EditRoleDetailsModal = ({ role, onClose }) => {
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState(role.displayName || '');
  const [description, setDescription] = useState(role.description || '');

  const { mutate: doUpdate, isLoading } = useMutation({
    mutationFn: (data) => updateRole(role._id, data),
    onSuccess: () => {
      toast.success('Role details updated');
      qc.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to update'),
  });

  return (
    <Modal title={`Edit role details \u2014 ${role.displayName || role.name}`} width={380} onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Display name *</label>
        <input
          style={inputStyle}
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          disabled={role.isSystemRole}
        />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Role slug (read-only)</label>
        <input
          style={{ ...inputStyle, opacity: 0.5 }}
          value={role.name}
          disabled
        />
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Description</label>
        <textarea
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={description}
          onChange={e => setDescription(e.target.value.slice(0, 200))}
          maxLength={200}
        />
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn
          variant="primary"
          disabled={isLoading || !displayName.trim()}
          onClick={() => doUpdate({ displayName: displayName.trim(), description: description.trim() })}
        >
          {isLoading ? 'Saving...' : 'Save'}
        </Btn>
      </div>
    </Modal>
  );
};

/* ══════════════════════════════════════════
   Duplicate Role Modal
   ══════════════════════════════════════════ */
const DuplicateRoleModal = ({ role, onClose, onCreated }) => {
  const qc = useQueryClient();
  const [name, setName] = useState(role.name + '_copy');
  const [displayName, setDisplayName] = useState((role.displayName || role.name) + ' (copy)');

  const { mutate: doDuplicate, isLoading } = useMutation({
    mutationFn: (data) => duplicateRole(role._id, data),
    onSuccess: (res) => {
      toast.success('Role duplicated');
      qc.invalidateQueries({ queryKey: ['roles'] });
      if (onCreated) onCreated(res.data?._id || res._id);
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to duplicate'),
  });

  const slug = slugify(name);

  return (
    <Modal title="Duplicate role" width={400} onClose={onClose}>
      <div style={{
        fontSize: 12, color: 'var(--text2)', marginBottom: 16, padding: '8px 12px',
        background: 'var(--surface2)', borderRadius: 8,
      }}>
        {role.displayName || role.name} &middot; {(role.permissions || []).length} permissions &middot; {role.userCount || 0} users
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>New role slug *</label>
        <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} />
        {name && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>
            Will be saved as: {slug}
          </div>
        )}
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>New display name *</label>
        <input style={inputStyle} value={displayName} onChange={e => setDisplayName(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn
          variant="primary"
          disabled={isLoading || !slug || !displayName.trim()}
          onClick={() => doDuplicate({ name: slug, displayName: displayName.trim() })}
        >
          {isLoading ? 'Creating...' : 'Create duplicate'}
        </Btn>
      </div>
    </Modal>
  );
};

/* ══════════════════════════════════════════
   Confirm Dialog (inline)
   ══════════════════════════════════════════ */
const ConfirmDialog = ({ message, onConfirm, onCancel, confirmLabel = 'Confirm', danger = false }) => (
  <Modal title="Confirm" width={380} onClose={onCancel}>
    <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18, lineHeight: 1.6 }}>
      {message}
    </div>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <Btn onClick={onCancel}>Cancel</Btn>
      <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Btn>
    </div>
  </Modal>
);

/* ── shared styles ── */
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text2)', marginBottom: 4 };
const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border2)', background: 'var(--surface2)',
  color: 'var(--text)', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
};

/* ══════════════════════════════════════════
   MAIN ROLES PAGE
   ══════════════════════════════════════════ */
export default function RolesPage() {
  const qc = useQueryClient();

  // Data fetching
  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
    retry: 1,
  });
  const { data: permissionsList, isLoading: permsLoading } = useQuery({
    queryKey: ['permissions-list'],
    queryFn: getPermissionsList,
    retry: 1,
  });

  const roles = rolesData?.data || rolesData || [];

  // State
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [localPermissions, setLocalPermissions] = useState([]);
  const [pendingChanges, setPendingChanges] = useState(new Set());
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const pendingNavRef = useRef(null);

  // Default select first role
  const selectedRole = roles.find(r => r._id === selectedRoleId);
  const isFirstLoad = useRef(true);
  if (isFirstLoad.current && roles.length > 0 && !selectedRoleId) {
    isFirstLoad.current = false;
    // Using a ref to trigger on next render
    setTimeout(() => {
      setSelectedRoleId(roles[0]._id);
      setLocalPermissions([...(roles[0].permissions || [])]);
    }, 0);
  }

  // Mutations
  const { mutate: doUpdatePerms, isLoading: isSaving } = useMutation({
    mutationFn: ({ id, data }) => updateRole(id, data),
    onSuccess: () => {
      toast.success(`Role updated \u2014 ${localPermissions.length} permissions`);
      qc.invalidateQueries({ queryKey: ['roles'] });
      setPendingChanges(new Set());
    },
    onError: (err) => toast.error('Failed to save \u2014 ' + (err?.response?.data?.message || err.message)),
  });

  const { mutate: doDelete } = useMutation({
    mutationFn: (id) => deleteRole(id),
    onSuccess: () => {
      toast.success('Role deleted');
      qc.invalidateQueries({ queryKey: ['roles'] });
      setSelectedRoleId(null);
      setLocalPermissions([]);
      setPendingChanges(new Set());
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to delete role'),
  });

  // Handlers
  const selectRole = useCallback((role) => {
    if (selectedRoleId === role._id) return;
    const doSwitch = () => {
      setSelectedRoleId(role._id);
      setLocalPermissions([...(role.permissions || [])]);
      setPendingChanges(new Set());
      setSearch('');
    };

    if (pendingChanges.size > 0) {
      pendingNavRef.current = doSwitch;
      setConfirmDialog({
        message: `You have unsaved changes to ${selectedRole?.displayName || selectedRole?.name}. Discard them?`,
        confirmLabel: 'Discard',
        danger: true,
        onConfirm: () => { pendingNavRef.current?.(); setConfirmDialog(null); },
        onCancel: () => setConfirmDialog(null),
      });
    } else {
      doSwitch();
    }
  }, [selectedRoleId, pendingChanges, selectedRole]);

  const handleToggle = useCallback((key) => {
    setLocalPermissions(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
    setPendingChanges(prev => { const s = new Set(prev); s.add(key); return s; });
  }, []);

  const handleToggleModule = useCallback((mod, keys, wasOn) => {
    setLocalPermissions(prev => {
      const s = new Set(prev);
      keys.forEach(k => wasOn ? s.delete(k) : s.add(k));
      return [...s];
    });
    setPendingChanges(prev => {
      const s = new Set(prev);
      keys.forEach(k => s.add(k));
      return s;
    });
  }, []);

  const handleDiscard = () => {
    if (selectedRole) setLocalPermissions([...(selectedRole.permissions || [])]);
    setPendingChanges(new Set());
  };

  const handleSave = () => {
    if (!selectedRoleId) return;
    doUpdatePerms({ id: selectedRoleId, data: { permissions: localPermissions } });
  };

  const handleDelete = () => {
    if (!selectedRole) return;
    const userCount = selectedRole.userCount || 0;
    if (selectedRole.isSystemRole || userCount > 0) return;
    setConfirmDialog({
      message: `Delete role "${selectedRole.displayName || selectedRole.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => { doDelete(selectedRoleId); setConfirmDialog(null); },
      onCancel: () => setConfirmDialog(null),
    });
  };

  const handleDuplicated = (newId) => {
    if (newId) {
      setSelectedRoleId(newId);
      // Permissions will be set when roles refetch
    }
  };

  // Update localPermissions when roles refetch and we have a selection
  const prevRolesRef = useRef(roles);
  if (roles !== prevRolesRef.current && selectedRoleId && pendingChanges.size === 0) {
    const updated = roles.find(r => r._id === selectedRoleId);
    if (updated) {
      prevRolesRef.current = roles;
      // Sync only if no pending changes
      if (JSON.stringify(localPermissions.slice().sort()) !== JSON.stringify((updated.permissions || []).slice().sort())) {
        setTimeout(() => setLocalPermissions([...(updated.permissions || [])]), 0);
      }
    }
  }

  if (rolesLoading || permsLoading) {
    return <LoadingSpinner style={{ padding: 60 }} />;
  }

  const userCount = selectedRole?.userCount || 0;
  const canDelete = selectedRole && !selectedRole.isSystemRole && userCount === 0;

  return (
    <div className="page-enter" style={{ display: 'flex', gap: 0, height: 'calc(100vh - var(--topbar-h) - 32px)' }}>
      {/* ──── LEFT COLUMN: Role list ──── */}
      <div style={{
        width: 260, flexShrink: 0, background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Roles</span>
          <Btn variant="primary" small onClick={() => setShowCreateModal(true)}>+ New role</Btn>
        </div>

        {/* Role cards */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {roles.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
              No roles yet
            </div>
          ) : roles.map(role => {
            const isSelected = role._id === selectedRoleId;
            const permCount = (role.permissions || []).length;
            const users = role.userCount || 0;
            return (
              <div
                key={role._id}
                onClick={() => selectRole(role)}
                style={{
                  padding: '10px 12px', marginBottom: 4, borderRadius: 8,
                  cursor: 'pointer', transition: 'all .15s',
                  borderLeft: `3px solid ${colorFromName(role.name || '')}`,
                  background: isSelected ? 'rgba(79,142,247,0.08)' : 'transparent',
                  border: isSelected
                    ? `1px solid rgba(79,142,247,0.4)`
                    : '1px solid transparent',
                  borderLeftWidth: 3,
                  borderLeftStyle: 'solid',
                  borderLeftColor: colorFromName(role.name || ''),
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface2)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                    {role.displayName || role.name}
                  </span>
                  {role.isSystemRole && (
                    <Badge variant="purple" style={{ fontSize: 9, padding: '1px 6px' }}>System</Badge>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                  {role.name}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                  <span>{permCount} permissions</span>
                  <span>|</span>
                  <span>{users} users</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ──── RIGHT COLUMN: Permission matrix ──── */}
      <div style={{
        flex: 1, marginLeft: 16, display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden', position: 'relative',
      }}>
        {!selectedRole ? (
          <EmptyState
            icon=""
            title="Select a role"
            message="Select a role to configure permissions"
          />
        ) : (
          <>
            {/* Role header */}
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>
                {selectedRole.displayName || selectedRole.name}
              </div>
              {selectedRole.description && (
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                  {selectedRole.description}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
                Slug: <span style={{ fontFamily: 'var(--mono)' }}>{selectedRole.name}</span>
                {' '}&middot;{' '}
                {userCount} user{userCount !== 1 ? 's' : ''} with this role
              </div>

              {/* System role warning */}
              {selectedRole.isSystemRole && (
                <div style={{
                  marginTop: 10, padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(124,95,240,0.08)', border: '1px solid rgba(124,95,240,0.2)',
                  fontSize: 12, color: 'var(--text2)', lineHeight: 1.5,
                }}>
                  System role &mdash; all permission changes are saved to audit log.
                  The role name cannot be changed.
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Btn small onClick={() => setShowEditModal(true)}>Edit name/desc</Btn>
                <Btn small onClick={() => setShowDuplicateModal(true)}>Duplicate role</Btn>
                <div style={{ position: 'relative' }} title={
                  !canDelete
                    ? selectedRole.isSystemRole
                      ? 'System roles cannot be deleted'
                      : `Cannot delete \u2014 ${userCount} users have this role. Reassign them first.`
                    : ''
                }>
                  <Btn small variant="danger" disabled={!canDelete} onClick={handleDelete}>
                    Delete role
                  </Btn>
                </div>
              </div>
            </div>

            {/* Search bar */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
              <input
                placeholder="Filter permissions..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  ...inputStyle, width: '100%',
                  background: 'var(--surface3)',
                }}
              />
            </div>

            {/* Permission matrix */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
              {(permissionsList?.data?.byModule || permissionsList?.byModule) ? (
                <PermissionMatrix
                  byModule={permissionsList.data?.byModule || permissionsList.byModule}
                  localPermissions={localPermissions}
                  onToggle={handleToggle}
                  onToggleModule={handleToggleModule}
                  searchFilter={search}
                />
              ) : (
                <div style={{ padding: 20, color: 'var(--text3)', fontSize: 12 }}>
                  No permissions configured
                </div>
              )}
            </div>

            {/* Save bar */}
            {pendingChanges.size > 0 && (
              <div style={{
                position: 'sticky', bottom: 0, padding: '12px 18px',
                background: 'var(--surface2)', borderTop: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {pendingChanges.size} change{pendingChanges.size !== 1 ? 's' : ''} to{' '}
                  {selectedRole.displayName || selectedRole.name} not saved
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn small onClick={handleDiscard}>Discard changes</Btn>
                  <Btn small variant="primary" disabled={isSaving} onClick={handleSave}>
                    {isSaving ? 'Saving...' : 'Save changes'}
                  </Btn>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ──── MODALS ──── */}
      {showCreateModal && (
        <CreateRoleModal
          onClose={() => setShowCreateModal(false)}
          roles={roles}
          permissionsList={permissionsList?.data || permissionsList}
        />
      )}
      {showEditModal && selectedRole && (
        <EditRoleDetailsModal
          role={selectedRole}
          onClose={() => setShowEditModal(false)}
        />
      )}
      {showDuplicateModal && selectedRole && (
        <DuplicateRoleModal
          role={selectedRole}
          onClose={() => setShowDuplicateModal(false)}
          onCreated={handleDuplicated}
        />
      )}
      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          danger={confirmDialog.danger}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
        />
      )}
    </div>
  );
}
