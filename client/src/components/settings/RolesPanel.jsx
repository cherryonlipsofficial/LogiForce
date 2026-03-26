import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getRoles, getRole, getPermissionsList, createRole, updateRole, deleteRole, duplicateRole } from '../../api/rolesApi';
import PageHeader from '../ui/PageHeader';
import Btn from '../ui/Btn';
import Modal from '../ui/Modal';
import LoadingSpinner from '../ui/LoadingSpinner';
import PermissionGate from '../ui/PermissionGate';

/* ── shared styles ── */
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

/* ── toggle switch ── */
const ToggleSwitch = ({ checked, onChange, disabled = false }) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!checked)}
    style={{
      width: 36,
      height: 20,
      borderRadius: 10,
      border: 'none',
      background: checked ? 'var(--accent)' : 'var(--surface3)',
      position: 'relative',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.15s',
      flexShrink: 0,
      opacity: disabled ? 0.4 : 1,
    }}
  >
    <div
      style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: checked ? '#fff' : 'var(--text3)',
        position: 'absolute',
        top: 3,
        left: checked ? 19 : 3,
        transition: 'all 0.15s',
      }}
    />
  </button>
);

/* ── group permissions by module ── */
const groupByModule = (perms) => {
  const groups = {};
  (perms || []).forEach((p) => {
    const mod = p.module || p.key.split('.')[0];
    if (!groups[mod]) groups[mod] = [];
    groups[mod].push(p);
  });
  return groups;
};

/* ────────────────────────────────────────────────
   PERMISSION MATRIX (used in panel + modals)
──────────────────────────────────────────────── */
const PermissionMatrix = ({ allPerms, activePerms, onChange, disabled = false, maxHeight }) => {
  const grouped = useMemo(() => groupByModule(allPerms), [allPerms]);
  const [collapsed, setCollapsed] = useState({});

  const toggleModule = (mod) => {
    setCollapsed((c) => ({ ...c, [mod]: !c[mod] }));
  };

  const modulePerms = (mod) => grouped[mod] || [];

  const isModuleAllChecked = (mod) => modulePerms(mod).every((p) => activePerms.includes(p.key));
  const isModuleNoneChecked = (mod) => modulePerms(mod).every((p) => !activePerms.includes(p.key));

  const handleModuleToggle = (mod) => {
    if (disabled) return;
    const keys = modulePerms(mod).map((p) => p.key);
    if (isModuleAllChecked(mod)) {
      onChange(activePerms.filter((k) => !keys.includes(k)));
    } else {
      onChange([...new Set([...activePerms, ...keys])]);
    }
  };

  const handlePermToggle = (key) => {
    if (disabled) return;
    if (activePerms.includes(key)) {
      onChange(activePerms.filter((k) => k !== key));
    } else {
      onChange([...activePerms, key]);
    }
  };

  return (
    <div style={{ maxHeight, overflowY: maxHeight ? 'auto' : undefined }}>
      {Object.keys(grouped).sort().map((mod) => {
        const allChecked = isModuleAllChecked(mod);
        const noneChecked = isModuleNoneChecked(mod);
        const isCollapsed = collapsed[mod];

        return (
          <div key={mod} style={{ marginBottom: 4 }}>
            {/* Module header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'var(--surface2)',
                borderRadius: 8,
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => toggleModule(mod)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text3)', transition: 'transform .15s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                  ▼
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>{mod}</span>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                  {modulePerms(mod).filter((p) => activePerms.includes(p.key)).length}/{modulePerms(mod).length}
                </span>
              </div>
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = !allChecked && !noneChecked;
                }}
                onChange={(e) => { e.stopPropagation(); handleModuleToggle(mod); }}
                disabled={disabled}
                style={{ cursor: disabled ? 'not-allowed' : 'pointer', accentColor: 'var(--accent)' }}
              />
            </div>

            {/* Permission rows */}
            {!isCollapsed && modulePerms(mod).map((p) => (
              <div
                key={p.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 14px 8px 36px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)' }}>{p.label || p.key}</div>
                  {p.description && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{p.description}</div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 1, opacity: 0.7 }}>{p.key}</div>
                </div>
                <ToggleSwitch
                  checked={activePerms.includes(p.key)}
                  onChange={() => handlePermToggle(p.key)}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

/* ────────────────────────────────────────────────
   EDIT ROLE DETAILS MODAL
──────────────────────────────────────────────── */
const EditRoleDetailsModal = ({ role, onClose, onSave }) => {
  const [form, setForm] = useState({
    displayName: role.displayName || '',
    description: role.description || '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(role._id, form);
  };

  return (
    <Modal title="Edit role details" width={400} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Display name</label>
          <input style={inputStyle} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Description</label>
          <textarea
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <Btn variant="primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
          Save changes
        </Btn>
      </form>
    </Modal>
  );
};

/* ────────────────────────────────────────────────
   DUPLICATE ROLE MODAL
──────────────────────────────────────────────── */
const DuplicateRoleModal = ({ role, onClose, onDuplicate }) => {
  const [form, setForm] = useState({
    name: `${role.name}-copy`,
    displayName: `${role.displayName || role.name} Copy`,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onDuplicate(role._id, form);
  };

  return (
    <Modal title="Duplicate role" width={360} onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
        Duplicating: <strong>{role.displayName || role.name}</strong> ({(role.permissions || []).length} permissions)
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>New role name</label>
          <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>New display name</label>
          <input style={inputStyle} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        </div>
        <Btn variant="primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
          Create duplicate
        </Btn>
      </form>
    </Modal>
  );
};

/* ────────────────────────────────────────────────
   CREATE ROLE MODAL
──────────────────────────────────────────────── */
const CreateRoleModal = ({ onClose, onCreate, allPerms, roles }) => {
  const [form, setForm] = useState({ name: '', displayName: '', description: '' });
  const [permissions, setPermissions] = useState([]);

  const applyTemplate = (templateName) => {
    if (templateName === 'blank') {
      setPermissions([]);
      return;
    }
    const found = (roles || []).find(
      (r) => r.name?.toLowerCase() === templateName.toLowerCase()
    );
    if (found) setPermissions([...(found.permissions || [])]);
  };

  const autoSlug = (val) => val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.displayName) {
      toast.error('Name and display name are required');
      return;
    }
    onCreate({ ...form, permissions });
  };

  return (
    <Modal title="Create role" width={500} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Name (slug)</label>
          <input
            style={{ ...inputStyle, fontFamily: 'var(--mono)' }}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: autoSlug(e.target.value) })}
            placeholder="e.g. warehouse-manager"
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Display name</label>
          <input style={inputStyle} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="e.g. Warehouse Manager" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Description (optional)</label>
          <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        {/* Template presets */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Start from a template</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['blank', 'accountant', 'ops', 'viewer'].map((t) => (
              <Btn
                key={t}
                small
                onClick={() => applyTemplate(t)}
                style={{ textTransform: 'capitalize' }}
              >
                {t === 'blank' ? 'Blank' : `Copy from ${t.charAt(0).toUpperCase() + t.slice(1)}`}
              </Btn>
            ))}
          </div>
        </div>

        {/* Permission matrix */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Permissions</label>
          <PermissionMatrix allPerms={allPerms} activePerms={permissions} onChange={setPermissions} maxHeight={400} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit">Create role</Btn>
        </div>
      </form>
    </Modal>
  );
};

/* ────────────────────────────────────────────────
   ROLES PANEL (main export)
──────────────────────────────────────────────── */
const RolesPanel = () => {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [localPerms, setLocalPerms] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);

  const { data: rolesData, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
  });

  const { data: allPermsData } = useQuery({
    queryKey: ['permissions-list'],
    queryFn: getPermissionsList,
  });

  const roles = rolesData?.data || rolesData?.roles || [];
  const allPerms = allPermsData?.data
    ? Object.values(allPermsData.data.byModule || {}).flat()
    : allPermsData?.permissions || [];

  // Auto-select first role
  useEffect(() => {
    if (!selectedId && roles.length > 0) {
      setSelectedId(roles[0]._id);
    }
  }, [roles, selectedId]);

  const selectedRole = roles.find((r) => r._id === selectedId) || null;

  // Load detail for selected role
  const { data: roleDetail } = useQuery({
    queryKey: ['role', selectedId],
    queryFn: () => getRole(selectedId),
    enabled: !!selectedId,
  });

  const detail = roleDetail?.data || roleDetail?.role || selectedRole;

  // Sync local perms when role changes
  useEffect(() => {
    if (detail) {
      setLocalPerms([...(detail.permissions || [])]);
    }
  }, [detail?._id, detail?.permissions?.length]);

  const originalPerms = detail?.permissions || [];
  const hasChanges = localPerms && JSON.stringify([...localPerms].sort()) !== JSON.stringify([...originalPerms].sort());
  const changesCount = localPerms
    ? localPerms.filter((p) => !originalPerms.includes(p)).length + originalPerms.filter((p) => !localPerms.includes(p)).length
    : 0;

  /* mutations */
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateRole(id, data),
    onSuccess: () => {
      toast.success('Role updated');
      qc.invalidateQueries(['roles']);
      qc.invalidateQueries(['role', selectedId]);
      setShowEditDetails(false);
    },
    onError: () => toast.error('Failed to update role'),
  });

  const createMutation = useMutation({
    mutationFn: createRole,
    onSuccess: (data) => {
      toast.success('Role created');
      qc.invalidateQueries(['roles']);
      setShowCreate(false);
      const newRole = data?.role || data;
      if (newRole?._id) setSelectedId(newRole._id);
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to create role'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      toast.success('Role deleted');
      qc.invalidateQueries(['roles']);
      setSelectedId(null);
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to delete role'),
  });

  const dupMutation = useMutation({
    mutationFn: ({ id, data }) => duplicateRole(id, data),
    onSuccess: (data) => {
      toast.success('Role duplicated');
      qc.invalidateQueries(['roles']);
      setShowDuplicate(false);
      const newRole = data?.role || data;
      if (newRole?._id) setSelectedId(newRole._id);
    },
    onError: () => toast.error('Failed to duplicate role'),
  });

  const handleSavePermissions = () => {
    if (!selectedId || !localPerms) return;
    updateMutation.mutate({ id: selectedId, data: { permissions: localPerms } });
  };

  const handleDeleteRole = () => {
    if (!detail) return;
    if (detail.isSystemRole) return;
    const userCount = detail.userCount || 0;
    if (userCount > 0) {
      toast.error('Cannot delete role with assigned users');
      return;
    }
    if (window.confirm(`Delete role "${detail.displayName || detail.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(detail._id);
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Roles & permissions"
        subtitle="Define what each role can access across the platform"
        action={
          <PermissionGate permission="roles.manage">
            <Btn variant="primary" onClick={() => setShowCreate(true)}>+ Create role</Btn>
          </PermissionGate>
        }
      />

      <div style={{ display: 'flex', gap: 0, minHeight: 500 }}>
        {/* Left: role list */}
        <div
          style={{
            width: 240,
            flexShrink: 0,
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            padding: '8px',
            alignSelf: 'flex-start',
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 200px)',
          }}
        >
          {roles.map((r) => (
            <button
              key={r._id}
              onClick={() => setSelectedId(r._id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 8,
                border: selectedId === r._id ? '1px solid rgba(79,142,247,0.4)' : '1px solid transparent',
                background: selectedId === r._id ? 'rgba(79,142,247,0.08)' : 'transparent',
                cursor: 'pointer',
                marginBottom: 4,
                transition: 'all .15s',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: selectedId === r._id ? 'var(--accent)' : 'var(--text)' }}>
                {r.displayName || r.name}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>{r.name}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>{(r.permissions || []).length} permissions</span>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>{r.userCount || 0} users</span>
              </div>
              {r.isSystemRole && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 500,
                    color: '#fbbf24',
                    background: 'rgba(245,158,11,0.12)',
                    padding: '1px 6px',
                    borderRadius: 4,
                    marginTop: 4,
                    display: 'inline-block',
                  }}
                >
                  SYSTEM
                </span>
              )}
            </button>
          ))}

          <PermissionGate permission="roles.manage">
            <button
              onClick={() => setShowCreate(true)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'center',
                padding: '8px',
                borderRadius: 8,
                border: '1px dashed var(--border2)',
                background: 'transparent',
                color: 'var(--text3)',
                fontSize: 12,
                cursor: 'pointer',
                marginTop: 4,
              }}
            >
              + Create role
            </button>
          </PermissionGate>
        </div>

        {/* Right: permission matrix */}
        <div style={{ flex: 1, marginLeft: 20 }}>
          {!detail ? (
            <div style={{ color: 'var(--text3)', fontSize: 13, padding: 24, textAlign: 'center' }}>
              Select a role to view permissions
            </div>
          ) : (
            <div
              style={{
                background: 'var(--surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)' }}>
                      {detail.displayName || detail.name}
                    </div>
                    {detail.description && (
                      <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{detail.description}</div>
                    )}
                  </div>
                  <PermissionGate permission="roles.manage">
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small onClick={() => setShowEditDetails(true)}>Edit details</Btn>
                      <Btn small onClick={() => setShowDuplicate(true)}>Duplicate</Btn>
                      <Btn
                        small
                        variant="danger"
                        disabled={detail.isSystemRole || (detail.userCount || 0) > 0}
                        onClick={handleDeleteRole}
                      >
                        Delete
                      </Btn>
                    </div>
                  </PermissionGate>
                </div>

                {detail.isSystemRole && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: '10px 14px',
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: '#fbbf24',
                      lineHeight: 1.5,
                    }}
                  >
                    This is a system role. The name cannot be changed. All permission changes are tracked.
                  </div>
                )}
              </div>

              {/* Matrix */}
              <div style={{ padding: '12px 16px', maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
                {allPerms.length === 0 ? (
                  <div style={{ color: 'var(--text3)', fontSize: 13, padding: 16, textAlign: 'center' }}>
                    No permissions defined
                  </div>
                ) : (
                  <PermissionMatrix
                    allPerms={allPerms}
                    activePerms={localPerms || []}
                    onChange={setLocalPerms}
                    disabled={detail.name === 'admin' && detail.isSystemRole}
                  />
                )}
              </div>

              {/* Sticky save bar */}
              {hasChanges && (
                <div
                  style={{
                    padding: '12px 20px',
                    borderTop: '1px solid var(--border)',
                    background: 'var(--surface2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    position: 'sticky',
                    bottom: 0,
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {changesCount} change{changesCount !== 1 ? 's' : ''} pending
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn small onClick={() => setLocalPerms([...(detail.permissions || [])])}>Discard</Btn>
                    <Btn small variant="primary" onClick={handleSavePermissions}>Save changes</Btn>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateRoleModal
          onClose={() => setShowCreate(false)}
          onCreate={(data) => createMutation.mutate(data)}
          allPerms={allPerms}
          roles={roles}
        />
      )}

      {showEditDetails && detail && (
        <EditRoleDetailsModal
          role={detail}
          onClose={() => setShowEditDetails(false)}
          onSave={(id, data) => updateMutation.mutate({ id, data })}
        />
      )}

      {showDuplicate && detail && (
        <DuplicateRoleModal
          role={detail}
          onClose={() => setShowDuplicate(false)}
          onDuplicate={(id, data) => dupMutation.mutate({ id, data })}
        />
      )}
    </div>
  );
};

export default RolesPanel;
