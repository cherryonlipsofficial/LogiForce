import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getUserPermissions, addPermissionOverride, removePermissionOverride } from '../../api/usersApi';
import { getPermissionsList } from '../../api/rolesApi';
import { getAvatarColor, getInitials } from '../../utils/avatarColor';
import Btn from '../ui/Btn';

const ROLE_COLORS = {
  admin:      { bg: 'rgba(124,95,240,0.15)', text: '#a78bfa' },
  accountant: { bg: 'rgba(29,179,136,0.15)',  text: '#4ade9a' },
  ops:        { bg: 'rgba(79,142,247,0.15)',  text: '#7eb3fc' },
  hr:         { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24' },
  viewer:     { bg: 'rgba(136,135,128,0.15)', text: 'var(--text3)' },
};

function getRoleColor(roleName = '') {
  return ROLE_COLORS[roleName] || { bg: 'rgba(216,90,48,0.15)', text: '#fb8c6b' };
}

export default function UserPermissionsModal({ user, onClose }) {
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [showDenyForm, setShowDenyForm] = useState(false);
  const [effectiveOpen, setEffectiveOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['user-permissions', user._id],
    queryFn: () => getUserPermissions(user._id).then(r => r.data),
  });

  const { data: permsList } = useQuery({
    queryKey: ['permissions-list'],
    queryFn: () => getPermissionsList().then(r => r.data),
  });

  const avatarColor = getAvatarColor(user.name);
  const initials = getInitials(user.name);
  const roleColor = getRoleColor(user.roleId?.name);

  const grantedOverrides = data?.overrides?.filter(o => o.granted) || [];
  const deniedOverrides = data?.overrides?.filter(o => !o.granted) || [];
  const effectivePermissions = data?.effectivePermissions || [];
  const rolePermissions = data?.rolePermissions || [];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)', borderRadius: 14, width: 580,
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '18px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: avatarColor.bg, color: avatarColor.text,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 500, flexShrink: 0,
              }}>{initials}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{user.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{user.email}</div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', fontSize: 18,
                color: 'var(--text3)', cursor: 'pointer', padding: '0 4px',
              }}
            >&times;</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
            Role: {user.roleId?.displayName || 'No role'} &middot; {effectivePermissions.length} effective permissions
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <div style={{
            padding: '60px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              width: 28, height: 28, border: '2px solid var(--border2)',
              borderTopColor: 'var(--accent)', borderRadius: '50%',
              animation: 'permspin .7s linear infinite',
            }} />
            <style>{`@keyframes permspin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Section 1: Role summary */}
            <div>
              <div style={{
                background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{
                  fontSize: 12, fontWeight: 500, padding: '3px 9px', borderRadius: 20,
                  background: roleColor.bg, color: roleColor.text,
                }}>
                  {user.roleId?.displayName || 'No role'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {rolePermissions.length} permissions from this role
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
                Changes below are individual overrides on top of the role.
                To change the base permissions, edit the role itself.
              </div>
            </div>

            {/* Section 2: Extra permissions */}
            <OverrideSection
              title="Extra permissions"
              overrides={grantedOverrides}
              emptyText="No extra permissions — user relies on their role."
              badgeColor="#4ade80"
              badgeBg="rgba(34,197,94,0.15)"
              removeLabel="Remove"
              removeDanger
              userId={user._id}
              refetch={refetch}
              showForm={showGrantForm}
              onToggleForm={() => { setShowGrantForm(!showGrantForm); setShowDenyForm(false); }}
              addBtnLabel="+ Grant permission"
              form={
                showGrantForm && (
                  <InlinePermForm
                    type="grant"
                    userId={user._id}
                    permsList={permsList}
                    effectivePermissions={effectivePermissions}
                    refetch={refetch}
                    onClose={() => setShowGrantForm(false)}
                  />
                )
              }
            />

            {/* Section 3: Denied permissions */}
            <OverrideSection
              title="Denied permissions"
              overrides={deniedOverrides}
              emptyText="No permissions have been explicitly denied."
              badgeColor="#f87171"
              badgeBg="rgba(239,68,68,0.15)"
              removeLabel="Restore"
              removeDanger={false}
              userId={user._id}
              refetch={refetch}
              showForm={showDenyForm}
              onToggleForm={() => { setShowDenyForm(!showDenyForm); setShowGrantForm(false); }}
              addBtnLabel="+ Deny permission"
              form={
                showDenyForm && (
                  <InlinePermForm
                    type="deny"
                    userId={user._id}
                    permsList={permsList}
                    effectivePermissions={effectivePermissions}
                    refetch={refetch}
                    onClose={() => setShowDenyForm(false)}
                  />
                )
              }
            />

            {/* Section 4: All effective permissions (collapsible) */}
            <div>
              <div
                onClick={() => setEffectiveOpen(!effectiveOpen)}
                style={{
                  cursor: 'pointer', fontSize: 12, color: 'var(--text2)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  userSelect: 'none',
                }}
              >
                <span style={{
                  display: 'inline-block',
                  transition: 'transform .2s',
                  transform: effectiveOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                }}>&#9656;</span>
                View all {effectivePermissions.length} effective permissions
              </div>
              <div style={{
                maxHeight: effectiveOpen ? 999 : 0,
                overflow: 'hidden',
                transition: 'max-height .3s ease',
              }}>
                {permsList?.byModule && (
                  <EffectivePermissionsList
                    byModule={permsList.byModule}
                    effectivePermissions={effectivePermissions}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </div>
      </div>
    </div>
  );
}


/* ── Override Section (shared for grant/deny) ── */

function OverrideSection({
  title, overrides, emptyText, badgeColor, badgeBg,
  removeLabel, removeDanger, userId, refetch,
  showForm, onToggleForm, addBtnLabel, form,
}) {
  const removeMutation = useMutation({
    mutationFn: (key) => removePermissionOverride(userId, key),
    onSuccess: () => { toast.success('Override removed'); refetch(); },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to remove override'),
  });

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 500 }}>
          {title}
        </span>
        {overrides.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
            background: badgeBg, color: badgeColor,
          }}>
            {overrides.length}
          </span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <Btn small variant="ghost" onClick={onToggleForm}>{addBtnLabel}</Btn>
        </div>
      </div>

      {/* List */}
      {overrides.length === 0 && !showForm && (
        <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 0' }}>{emptyText}</div>
      )}
      {overrides.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {overrides.map(o => (
            <div key={o.key} style={{
              background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{o.label || o.key}</span>
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 12,
                    background: 'var(--surface3)', color: 'var(--text3)',
                  }}>{o.module || o.key.split('.')[0]}</span>
                </div>
                {o.reason && (
                  <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text3)', marginTop: 2 }}>
                    — {o.reason}
                  </div>
                )}
              </div>
              <Btn
                small
                variant={removeDanger ? 'danger' : 'ghost'}
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate(o.key)}
              >
                {removeLabel}
              </Btn>
            </div>
          ))}
        </div>
      )}

      {/* Inline form */}
      {form}
    </div>
  );
}


/* ── Inline Permission Form (grant / deny) ── */

function InlinePermForm({ type, userId, permsList, effectivePermissions, refetch, onClose }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [reason, setReason] = useState('');
  const [listOpen, setListOpen] = useState(true);

  const isGrant = type === 'grant';
  const accent = isGrant ? '34,197,94' : '239,68,68';

  // Build filtered options
  const options = useMemo(() => {
    if (!permsList?.byModule) return [];
    const allPerms = [];
    for (const [mod, perms] of Object.entries(permsList.byModule)) {
      for (const p of perms) {
        allPerms.push({ ...p, module: mod });
      }
    }
    return allPerms.filter(p => {
      if (isGrant) {
        // Only show permissions NOT already effective
        return !effectivePermissions.includes(p.key);
      } else {
        // Only show permissions currently effective (can only deny what they have)
        return effectivePermissions.includes(p.key);
      }
    }).filter(p => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return p.label?.toLowerCase().includes(q) || p.key.toLowerCase().includes(q);
    });
  }, [permsList, effectivePermissions, searchTerm, isGrant]);

  const mutation = useMutation({
    mutationFn: (data) => addPermissionOverride(userId, data),
    onSuccess: () => {
      toast.success(isGrant ? 'Permission granted' : 'Permission denied');
      refetch();
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to add override'),
  });

  const handleConfirm = () => {
    if (!selectedKey || reason.length < 3) return;
    mutation.mutate({ key: selectedKey, granted: isGrant, reason });
  };

  return (
    <div style={{
      background: `rgba(${accent},0.04)`,
      border: `1px solid rgba(${accent},0.15)`,
      borderRadius: 10, padding: '12px 14px', marginTop: 8,
    }}>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
        {isGrant ? 'Grant an extra permission' : 'Deny a permission'}
      </div>

      {/* Selected pill or search input */}
      {selectedKey ? (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 20,
          background: `rgba(${accent},0.12)`, color: isGrant ? '#4ade80' : '#f87171',
          fontSize: 12, marginBottom: 10,
        }}>
          {selectedLabel || selectedKey}
          <span
            onClick={() => { setSelectedKey(null); setSelectedLabel(''); setListOpen(true); }}
            style={{ cursor: 'pointer', fontSize: 14 }}
          >&times;</span>
        </div>
      ) : (
        <>
          <input
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setListOpen(true); }}
            onFocus={() => setListOpen(true)}
            placeholder="Search permissions..."
            style={{
              width: '100%', height: 34, padding: '0 12px',
              border: '1px solid var(--border2)', borderRadius: 8,
              background: 'var(--surface)', color: 'var(--text)', fontSize: 12,
              boxSizing: 'border-box', marginBottom: 6,
            }}
          />
          {listOpen && (
            <div style={{
              maxHeight: 160, overflowY: 'auto', borderRadius: 8,
              border: '1px solid var(--border2)', background: 'var(--surface)',
              marginBottom: 10,
            }}>
              {options.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text3)' }}>
                  No matching permissions
                </div>
              ) : (
                options.map(p => (
                  <div
                    key={p.key}
                    onClick={() => {
                      setSelectedKey(p.key);
                      setSelectedLabel(p.label || p.key);
                      setListOpen(false);
                      setSearchTerm('');
                    }}
                    style={{
                      padding: '7px 12px', cursor: 'pointer',
                      transition: 'background .1s',
                      borderBottom: '1px solid var(--border)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>{p.label || p.key}</span>
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 12,
                        background: 'var(--surface3)', color: 'var(--text3)',
                      }}>{p.module}</span>
                    </div>
                    <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>
                      {p.key}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Reason input */}
      <input
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="Why is this needed? (required)"
        style={{
          width: '100%', height: 34, padding: '0 12px',
          border: '1px solid var(--border2)', borderRadius: 8,
          background: 'var(--surface)', color: 'var(--text)', fontSize: 12,
          boxSizing: 'border-box', marginBottom: 10,
        }}
      />

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn small variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn
          small
          variant={isGrant ? 'success' : 'danger'}
          disabled={!selectedKey || reason.length < 3 || mutation.isPending}
          onClick={handleConfirm}
        >
          {mutation.isPending ? '...' : isGrant ? 'Confirm grant' : 'Confirm deny'}
        </Btn>
      </div>
    </div>
  );
}


/* ── Effective Permissions List ── */

function EffectivePermissionsList({ byModule, effectivePermissions }) {
  const modules = Object.entries(byModule).filter(([, perms]) =>
    perms.some(p => effectivePermissions.includes(p.key))
  );

  return (
    <div style={{ marginTop: 10 }}>
      {modules.map(([mod, perms]) => {
        const grantedCount = perms.filter(p => effectivePermissions.includes(p.key)).length;
        return (
          <div key={mod}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 10, marginBottom: 4,
            }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 500 }}>
                {mod}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                {grantedCount}/{perms.length} permissions
              </span>
            </div>
            {perms.map(p => {
              const granted = effectivePermissions.includes(p.key);
              return (
                <div key={p.key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 0',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12 }}>{granted ? '✓' : '🔒'}</span>
                    <span style={{ fontSize: 12, color: granted ? 'var(--text)' : 'var(--text3)' }}>
                      {p.label || p.key}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
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
}
