import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { updateUser } from '../../api/usersApi';
import { useAuth } from '../../context/AuthContext';
import RoleSelect from './RoleSelect';

const inputStyle = {
  width: '100%',
  height: 38,
  padding: '0 12px',
  border: '1px solid var(--border2)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 13,
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text2)',
  marginBottom: 5,
};

const errorStyle = {
  fontSize: 12,
  color: '#f87171',
  marginTop: 4,
};

export default function EditUserModal({ user, onClose, onSuccess, roles }) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const isSelf = currentUser?._id === user._id;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: user.name || '',
      email: user.email || '',
      roleId: user.roleId?._id || '',
      isActive: user.isActive ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: (data) => updateUser(user._id, data),
    onSuccess: () => {
      toast.success('User updated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSuccess();
      onClose();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to update user');
    },
  });

  const onSubmit = (data) => {
    mutation.mutate({
      name: data.name,
      email: data.email,
      roleId: data.roleId,
      isActive: data.isActive,
    });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 14, width: 440,
        maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 20px 0', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', margin: 0 }}>
            Edit user — {user.name}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: 18,
              color: 'var(--text3)', cursor: 'pointer', padding: '0 4px',
            }}
          >&times;</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Self-edit warning */}
            {isSelf && (
              <div style={{
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 12,
                color: 'var(--text2)',
                lineHeight: 1.5,
              }}>
                You are editing your own account. Changing your role will affect
                your current session and may remove access to this page.
              </div>
            )}

            {/* Full name */}
            <div>
              <label style={labelStyle}>Full name</label>
              <input
                {...register('name', {
                  required: 'Full name is required',
                  minLength: { value: 2, message: 'Name must be at least 2 characters' },
                  maxLength: { value: 80, message: 'Name must be at most 80 characters' },
                })}
                style={inputStyle}
              />
              {errors.name && <div style={errorStyle}>{errors.name.message}</div>}
            </div>

            {/* Email */}
            <div>
              <label style={labelStyle}>Email address</label>
              <input
                type="email"
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email address' },
                })}
                style={inputStyle}
              />
              {errors.email && <div style={errorStyle}>{errors.email.message}</div>}
            </div>

            {/* Role */}
            <div>
              <label style={labelStyle}>Role</label>
              <Controller
                name="roleId"
                control={control}
                rules={{ required: 'Please select a role' }}
                render={({ field }) => (
                  <RoleSelect
                    value={field.value}
                    onChange={field.onChange}
                    roles={roles}
                  />
                )}
              />
              {errors.roleId && <div style={errorStyle}>{errors.roleId.message}</div>}
            </div>

            {/* Account status toggle */}
            <div>
              <label style={labelStyle}>Account status</label>
              <Controller
                name="isActive"
                control={control}
                render={({ field }) => {
                  const isOn = field.value;
                  const isDisabled = isSelf;
                  return (
                    <div style={{ position: 'relative' }}>
                      <div
                        onClick={() => !isDisabled && field.onChange(!isOn)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: '1px solid var(--border2)',
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          opacity: isDisabled ? 0.5 : 1,
                          background: 'var(--surface)',
                        }}
                        title={isDisabled ? 'Cannot deactivate your own account' : undefined}
                      >
                        {/* Toggle track */}
                        <div style={{
                          width: 36,
                          height: 20,
                          borderRadius: 10,
                          background: isOn ? 'rgba(34,197,94,0.3)' : 'var(--surface3)',
                          position: 'relative',
                          transition: 'background 0.2s',
                          flexShrink: 0,
                        }}>
                          {/* Toggle knob */}
                          <div style={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: isOn ? '#22c55e' : 'var(--text3)',
                            position: 'absolute',
                            top: 2,
                            left: isOn ? 18 : 2,
                            transition: 'left 0.2s, background 0.2s',
                          }} />
                        </div>
                        <span style={{
                          fontSize: 12,
                          color: isOn ? '#4ade80' : 'var(--text3)',
                          fontWeight: 500,
                        }}>
                          {isOn ? 'Active — user can log in' : 'Inactive — user cannot log in'}
                        </span>
                      </div>
                      {isDisabled && (
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                          Cannot deactivate your own account
                        </div>
                      )}
                    </div>
                  );
                }}
              />
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '0 20px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end',
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 13,
                background: 'transparent', border: '1px solid var(--border2)',
                color: 'var(--text2)', cursor: 'pointer',
              }}
            >Cancel</button>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                background: 'var(--accent)', color: '#fff', border: 'none',
                cursor: mutation.isPending ? 'not-allowed' : 'pointer',
                opacity: mutation.isPending ? 0.7 : 1,
              }}
            >{mutation.isPending ? 'Saving...' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
