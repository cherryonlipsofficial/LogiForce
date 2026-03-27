import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import StatusBadge from '../ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { changeDriverStatus } from '../../api/driversApi';

const ALL_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending_kyc', label: 'Pending KYC' },
  { value: 'pending_verification', label: 'Pending Verification' },
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'resigned', label: 'Resigned' },
  { value: 'offboarding', label: 'Offboarding' },
];

const OPS_TRANSITIONS = {
  active: ['on_leave', 'suspended', 'resigned', 'offboarding'],
  on_leave: ['active', 'resigned'],
  suspended: ['active', 'resigned', 'offboarding'],
  offboarding: ['resigned'],
};

const EARLY_STAGES = ['draft', 'pending_kyc', 'pending_verification'];

const BUTTON_TEXT = {
  active: 'Reinstate driver',
  on_leave: 'Put on leave',
  suspended: 'Suspend driver',
  resigned: 'Mark as resigned',
  offboarding: 'Begin offboarding',
};

const DESTRUCTIVE_STATUSES = ['suspended', 'resigned'];

const ChangeStatusModal = ({ driver, presetStatus, onClose, onSuccess }) => {
  const { isAdmin } = useAuth();
  const [newStatus, setNewStatus] = useState(presetStatus || '');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const queryClient = useQueryClient();
  const driverId = driver._id || driver.id;

  const currentStatus = driver.status || 'draft';

  // Determine available statuses
  // Non-admin users can only transition to: Active, On Leave, Suspended, Resigned, Offboarding
  // Only admin can see all statuses (including Draft, Pending KYC, Pending Verification)
  const NON_ADMIN_STATUSES = ['active', 'on_leave', 'suspended', 'resigned', 'offboarding'];
  let availableStatuses;
  if (isAdmin) {
    availableStatuses = ALL_STATUSES.filter((s) => s.value !== currentStatus);
  } else {
    const allowed = OPS_TRANSITIONS[currentStatus] || [];
    availableStatuses = ALL_STATUSES.filter(
      (s) => allowed.includes(s.value) && NON_ADMIN_STATUSES.includes(s.value)
    );
  }

  const isAdminOverride = isAdmin && EARLY_STAGES.includes(newStatus);
  const isDestructive = DESTRUCTIVE_STATUSES.includes(newStatus);
  const buttonText = BUTTON_TEXT[newStatus] || 'Change status';
  const buttonVariant = isDestructive ? 'danger' : 'primary';

  const mutation = useMutation({
    mutationFn: () => changeDriverStatus(driverId, { status: newStatus, reason }),
    onSuccess: () => {
      const label = ALL_STATUSES.find((s) => s.value === newStatus)?.label || newStatus;
      toast.success(`Status changed to ${label}`);
      queryClient.invalidateQueries({ queryKey: ['driver', driverId] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to change status');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason || reason.trim().length < 5) {
      setReasonError('Reason is required (minimum 5 characters)');
      return;
    }
    setReasonError('');
    if (!newStatus) return;
    mutation.mutate();
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };
  const errorStyle = { color: '#f87171', fontSize: 11, marginTop: 2 };

  return (
    <Modal title="Change driver status" onClose={onClose} width={440}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Current status</label>
          <StatusBadge status={currentStatus} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>New status *</label>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            required
          >
            <option value="" disabled>Select status...</option>
            {availableStatuses.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Reason (required) *</label>
          <textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); setReasonError(''); }}
            rows={3}
            placeholder="Enter reason for status change..."
            style={{ width: '100%', resize: 'vertical' }}
          />
          {reasonError && <div style={errorStyle}>{reasonError}</div>}
        </div>

        {isAdminOverride && (
          <div style={{
            background: 'rgba(248,113,113,0.08)',
            border: '1px solid rgba(248,113,113,0.25)',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 14,
            fontSize: 12,
            color: '#f87171',
          }}>
            Admin override — this will bypass the normal workflow. This action is logged and cannot be undone.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose} type="button">Cancel</Btn>
          <Btn
            variant={buttonVariant}
            type="submit"
            disabled={mutation.isPending || !newStatus}
          >
            {mutation.isPending ? 'Updating...' : buttonText}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default ChangeStatusModal;
