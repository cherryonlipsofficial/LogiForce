import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { createUser } from '../../api/usersApi';
import RoleSelect from './RoleSelect';
import PasswordStrengthBar from './PasswordStrengthBar';

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

export default function AddUserModal({ onClose, onSuccess, roles }) {
  const queryClient = useQueryClient();
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm({ defaultValues: { name: '', email: '', roleId: '', password: '', confirmPassword: '' } });

  const watchedPassword = watch('password');
  const watchedRoleId = watch('roleId');

  const mutation = useMutation({
    mutationFn: (data) => createUser(data),
    onSuccess: (res) => {
      const userName = res.data?.name || res.data?.user?.name || '';
      toast.success(
        `${userName} created. Go to Users page to activate their account.`,
        { duration: 5000 }
      );
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['inactive-users'] });
      queryClient.invalidateQueries({ queryKey: ['inactive-users-count'] });
      onSuccess();
      onClose();
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || 'Failed to create user';
      if (msg.toLowerCase().includes('email')) {
        setError('email', { message: 'This email is already registered' });
      } else {
        toast.error(msg);
      }
    },
  });

  const onSubmit = (data) => {
    if (!data.roleId) {
      setError('roleId', { message: 'Please select a role' });
      return;
    }
    const { confirmPassword, ...payload } = data;
    mutation.mutate(payload);
  };

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      paddingTop: 'calc(var(--topbar-h) + 24px)',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 14, width: 440,
        maxHeight: 'calc(100vh - var(--topbar-h) - 48px)',
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 20px 0', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', margin: 0 }}>
            Add user account
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
                placeholder="e.g. John Doe"
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
                placeholder="user@company.com"
              />
              {errors.email && <div style={errorStyle}>{errors.email.message}</div>}
            </div>

            {/* Role */}
            <div>
              <label style={labelStyle}>Role</label>
              <RoleSelect
                value={watchedRoleId}
                onChange={(id) => setValue('roleId', id, { shouldValidate: true })}
                roles={roles}
              />
              {errors.roleId && <div style={errorStyle}>{errors.roleId.message}</div>}
            </div>

            {/* Password */}
            <div>
              <label style={labelStyle}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Password must be at least 8 characters' },
                  })}
                  style={{ ...inputStyle, paddingRight: 56 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', fontSize: 11, color: 'var(--text3)',
                    cursor: 'pointer',
                  }}
                >{showPw ? 'Hide' : 'Show'}</button>
              </div>
              <PasswordStrengthBar password={watchedPassword || ''} />
              {errors.password && <div style={errorStyle}>{errors.password.message}</div>}
            </div>

            {/* Confirm password */}
            <div>
              <label style={labelStyle}>Confirm password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  {...register('confirmPassword', {
                    required: 'Please confirm your password',
                    validate: (val) => val === watchedPassword || 'Passwords do not match',
                  })}
                  style={{ ...inputStyle, paddingRight: 56 }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', fontSize: 11, color: 'var(--text3)',
                    cursor: 'pointer',
                  }}
                >{showConfirm ? 'Hide' : 'Show'}</button>
              </div>
              {errors.confirmPassword && <div style={errorStyle}>{errors.confirmPassword.message}</div>}
            </div>
            {/* Activation notice */}
            <div style={{
              background:   'rgba(245,158,11,0.08)',
              border:       '1px solid rgba(245,158,11,0.2)',
              borderRadius: 8,
              padding:      '10px 14px',
              fontSize:     12,
              color:        '#fbbf24',
              marginTop:    8,
              lineHeight:   1.6,
            }}>
              The new user account will be created in <strong>inactive</strong> state.
              They will not be able to log in until you activate their account
              from the Users page.
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
            >{mutation.isPending ? 'Creating...' : 'Create user (inactive)'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
