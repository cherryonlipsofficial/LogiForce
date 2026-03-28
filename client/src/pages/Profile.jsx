import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { getProfile, updateProfile, changePassword, updatePreferences } from '../api/authApi';
import PasswordStrengthBar from '../components/settings/PasswordStrengthBar';

const AVATAR_COLORS = [
  { name: 'blue', bg: 'rgba(79,142,247,0.15)', border: 'rgba(79,142,247,0.35)', text: '#4f8ef7' },
  { name: 'teal', bg: 'rgba(45,212,191,0.15)', border: 'rgba(45,212,191,0.35)', text: '#2dd4bf' },
  { name: 'purple', bg: 'rgba(124,95,240,0.15)', border: 'rgba(124,95,240,0.35)', text: '#7c5ff0' },
  { name: 'amber', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.35)', text: '#f59e0b' },
  { name: 'coral', bg: 'rgba(251,113,133,0.15)', border: 'rgba(251,113,133,0.35)', text: '#fb7185' },
  { name: 'pink', bg: 'rgba(236,72,153,0.15)', border: 'rgba(236,72,153,0.35)', text: '#ec4899' },
];

const ROLE_COLORS = {
  admin: { bg: 'rgba(124,95,240,0.12)', color: '#a78bfa' },
  compliance: { bg: 'rgba(45,212,191,0.12)', color: '#2dd4bf' },
  sales: { bg: 'rgba(79,142,247,0.12)', color: '#4f8ef7' },
  default: { bg: 'rgba(156,163,175,0.12)', color: '#9ca3af' },
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--border2)',
  background: 'var(--surface2)',
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
  height: 38,
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text2)',
  marginBottom: 4,
};

const cardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 24,
  marginBottom: 16,
};

function formatShortDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatShortDate(dateStr);
}

const Profile = () => {
  const { updateUser } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => getProfile().then(r => r.data.data),
  });

  const profile = data?.user;
  const permissionCount = data?.permissionCount || 0;
  const effectivePermissions = data?.effectivePermissions || [];

  // Avatar color state
  const [avatarColor, setAvatarColor] = useState('blue');
  useEffect(() => {
    if (profile?.preferences?.initialsColor) {
      setAvatarColor(profile.preferences.initialsColor);
    }
  }, [profile]);

  const colorObj = AVATAR_COLORS.find(c => c.name === avatarColor) || AVATAR_COLORS[0];

  const initials = profile?.name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase() || 'U';

  // Avatar color mutation
  const avatarMutation = useMutation({
    mutationFn: (color) => updatePreferences({ preferredInitialsColor: color }),
    onSuccess: () => toast.success('Avatar color updated'),
    onError: () => toast.error('Failed to update avatar color'),
  });

  const handleColorClick = (color) => {
    setAvatarColor(color);
    avatarMutation.mutate(color);
  };

  // Role badge
  const roleName = profile?.roleId?.name || 'default';
  const roleDisplay = profile?.roleId?.displayName || profile?.roleId?.name || 'User';
  const roleColor = ROLE_COLORS[roleName] || ROLE_COLORS.default;

  if (isLoading) {
    return (
      <div className="page-enter" style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 48 }}>Loading profile...</div>
      </div>
    );
  }

  // If user is inactive (edge case safety — shouldn't happen since inactive users can't login)
  if (profile && !profile.isActive) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', flexDirection: 'column', gap: 16, textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>&#x26D4;</div>
        <h2 style={{ fontSize: 18, fontWeight: 500 }}>Your account is not active</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 340 }}>
          Contact your administrator to activate your account.
        </p>
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
      {/* Section 1: Profile header */}
      <ProfileHeader
        initials={initials}
        colorObj={colorObj}
        avatarColor={avatarColor}
        onColorClick={handleColorClick}
        profile={profile}
        roleDisplay={roleDisplay}
        roleColor={roleColor}
      />

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Section 2: Personal information */}
          <PersonalInfoForm profile={profile} updateUser={updateUser} queryClient={queryClient} />
          {/* Section 3: Change password */}
          <ChangePasswordSection />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Section 4: Permissions */}
          <PermissionsSection
            roleDisplay={roleDisplay}
            roleDescription={profile?.roleId?.description}
            permissionCount={permissionCount}
            effectivePermissions={effectivePermissions}
          />
          {/* Section 5: Account activity */}
          <AccountActivity profile={profile} />
        </div>
      </div>
    </div>
  );
};

/* ── Profile Header Card ── */
const ProfileHeader = ({ initials, colorObj, avatarColor, onColorClick, profile, roleDisplay, roleColor }) => (
  <div style={{ ...cardStyle, display: 'flex', gap: 24, alignItems: 'flex-start' }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: colorObj.bg,
          border: `2px solid ${colorObj.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          fontWeight: 600,
          color: colorObj.text,
        }}
      >
        {initials}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {AVATAR_COLORS.map(c => (
          <button
            key={c.name}
            onClick={() => onColorClick(c.name)}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: c.bg,
              border: avatarColor === c.name ? `2px solid ${c.text}` : '2px solid transparent',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={c.name}
          >
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: c.text }} />
          </button>
        ))}
      </div>
      <span style={{ fontSize: 10, color: 'var(--text3)' }}>Choose avatar color</span>
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>{profile?.name}</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>{profile?.email}</div>
      <span
        style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          background: roleColor.bg,
          color: roleColor.color,
          marginBottom: 12,
        }}
      >
        {roleDisplay}
      </span>
      <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text3)' }}>
        <span>Member since {formatShortDate(profile?.createdAt)}</span>
        <span>Last login: {formatRelativeTime(profile?.lastLogin)}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 500,
            background: profile?.isActive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            color: profile?.isActive ? '#22c55e' : '#ef4444',
          }}
        >
          {profile?.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
    </div>
  </div>
);

/* ── Personal Info Form ── */
const PersonalInfoForm = ({ profile, updateUser, queryClient }) => {
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    defaultValues: { name: profile?.name || '', email: profile?.email || '' },
  });

  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (data) => updateProfile(data),
    onSuccess: (res) => {
      const u = res.data.data.user;
      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      updateUser({ name: u.name, email: u.email });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || 'Failed to update profile';
      if (msg.toLowerCase().includes('email')) {
        setError('email', { message: msg });
      } else {
        toast.error(msg);
      }
    },
  });

  const onSubmit = (data) => mutation.mutate(data);

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 16px', color: 'var(--text)' }}>Personal information</h3>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Full name *</label>
          <input
            style={{ ...inputStyle, borderColor: errors.name ? '#f87171' : undefined }}
            {...register('name', {
              required: 'Name is required',
              minLength: { value: 2, message: 'Name must be at least 2 characters' },
              maxLength: { value: 80, message: 'Name must be at most 80 characters' },
            })}
          />
          {errors.name && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{errors.name.message}</div>}
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Email address *</label>
          <input
            type="email"
            style={{ ...inputStyle, borderColor: errors.email ? '#f87171' : undefined }}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Must be a valid email' },
            })}
          />
          {errors.email && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{errors.email.message}</div>}
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            Changing your email will require you to use the new email to log in next time.
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          {saved && (
            <span style={{ fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4, animation: 'fadeIn .2s ease' }}>
              <span>&#10003;</span> Saved
            </span>
          )}
          <button
            type="submit"
            disabled={mutation.isPending}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
              color: '#fff',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              opacity: mutation.isPending ? 0.7 : 1,
            }}
          >
            {mutation.isPending ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

/* ── Change Password Section ── */
const ChangePasswordSection = () => {
  const [expanded, setExpanded] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { register, handleSubmit, watch, reset, setError, formState: { errors } } = useForm({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const newPassword = watch('newPassword');

  const mutation = useMutation({
    mutationFn: (data) => changePassword(data),
    onSuccess: () => {
      toast.success('Password changed successfully');
      reset();
      setExpanded(false);
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || 'Failed to change password';
      if (msg.toLowerCase().includes('current password')) {
        setError('currentPassword', { message: msg });
      } else if (msg.toLowerCase().includes('different') || msg.toLowerCase().includes('new password')) {
        setError('newPassword', { message: msg });
      } else {
        toast.error(msg);
      }
    },
  });

  const onSubmit = (data) => mutation.mutate(data);

  const handleCancel = () => {
    reset();
    setExpanded(false);
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const toggleStyle = {
    fontSize: 11,
    color: 'var(--accent)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
  };

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0, color: 'var(--text)' }}>Change password</h3>
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          style={{
            marginTop: 12,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid var(--border2)',
            background: 'transparent',
            color: 'var(--text2)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Change password
        </button>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 14, position: 'relative' }}>
            <label style={labelStyle}>Current password *</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showCurrent ? 'text' : 'password'}
                style={{ ...inputStyle, paddingRight: 50, borderColor: errors.currentPassword ? '#f87171' : undefined }}
                {...register('currentPassword', { required: 'Current password is required' })}
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} style={toggleStyle}>
                {showCurrent ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.currentPassword && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{errors.currentPassword.message}</div>}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>New password *</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showNew ? 'text' : 'password'}
                style={{ ...inputStyle, paddingRight: 50, borderColor: errors.newPassword ? '#f87171' : undefined }}
                {...register('newPassword', {
                  required: 'New password is required',
                  minLength: { value: 8, message: 'Must be at least 8 characters' },
                })}
              />
              <button type="button" onClick={() => setShowNew(!showNew)} style={toggleStyle}>
                {showNew ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.newPassword && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{errors.newPassword.message}</div>}
            <PasswordStrengthBar password={newPassword || ''} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Confirm new password *</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirm ? 'text' : 'password'}
                style={{ ...inputStyle, paddingRight: 50, borderColor: errors.confirmPassword ? '#f87171' : undefined }}
                {...register('confirmPassword', {
                  required: 'Please confirm your new password',
                  validate: (val) => val === newPassword || 'Passwords do not match',
                })}
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={toggleStyle}>
                {showConfirm ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.confirmPassword && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{errors.confirmPassword.message}</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                color: 'var(--text3)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
                color: '#fff',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                opacity: mutation.isPending ? 0.7 : 1,
              }}
            >
              {mutation.isPending ? 'Updating...' : 'Update password'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

/* ── Permissions Section ── */
const PermissionsSection = ({ roleDisplay, roleDescription, permissionCount, effectivePermissions }) => {
  const [expanded, setExpanded] = useState(false);

  // Group by module
  const grouped = {};
  effectivePermissions.forEach((key) => {
    const mod = key.split('.')[0];
    if (!grouped[mod]) grouped[mod] = [];
    grouped[mod].push(key);
  });

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 12px', color: 'var(--text)' }}>Your access permissions</h3>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>
        You have the <strong style={{ color: 'var(--text)' }}>{roleDisplay}</strong> role with {permissionCount} permissions.
      </div>
      {roleDescription && (
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>{roleDescription}</div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--accent)',
          fontSize: 12,
          cursor: 'pointer',
          padding: 0,
          marginBottom: expanded ? 12 : 0,
        }}
      >
        {expanded ? 'Hide' : 'View all'} {permissionCount} permissions
      </button>

      {expanded && (
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {Object.keys(grouped).sort().map(mod => (
            <div key={mod} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 600, marginBottom: 4, letterSpacing: '0.5px' }}>
                {mod}
              </div>
              {grouped[mod].sort().map(key => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px 8px' }}>
                  <span style={{ color: '#4ade80', fontSize: 12 }}>&#10003;</span>
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>{key}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12 }}>
        Contact your administrator to request changes to your permissions.
      </div>
    </div>
  );
};

/* ── Account Activity ── */
const AccountActivity = ({ profile }) => {
  const overrideCount = profile?.permissionOverrides?.length || 0;

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 12px', color: 'var(--text)' }}>Account activity</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--text3)' }}>Account created</span>
          <span style={{ color: 'var(--text)' }}>{formatShortDate(profile?.createdAt)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--text3)' }}>Last login</span>
          <span style={{ color: 'var(--text)' }}>{formatRelativeTime(profile?.lastLogin)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--text3)' }}>Account activated</span>
          <span style={{ color: 'var(--text)' }}>{formatShortDate(profile?.activatedAt) || 'N/A'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--text3)' }}>Activated by</span>
          <span style={{ color: 'var(--text)' }}>{profile?.activatedBy?.name || 'System'}</span>
        </div>
      </div>
      {overrideCount > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
            fontSize: 12,
            color: '#f59e0b',
            lineHeight: 1.5,
          }}
        >
          You have {overrideCount} custom permission override{overrideCount !== 1 ? 's' : ''} applied to your account.
          Contact your administrator for details.
        </div>
      )}
    </div>
  );
};

export default Profile;
