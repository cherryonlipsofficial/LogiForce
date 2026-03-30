import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import { raiseBatchDispute } from '../../api/attendanceApi';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const DISPUTE_TYPES = [
  { value: 'incorrect_days', label: 'Incorrect working days' },
  { value: 'missing_driver', label: 'Driver missing from attendance' },
  { value: 'extra_driver', label: 'Unknown driver in attendance' },
  { value: 'overtime_mismatch', label: 'Overtime hours incorrect' },
  { value: 'other', label: 'Other issue' },
];

const DisputeModal = ({ batch, onClose, onSuccess }) => {
  const { isMobile } = useBreakpoint();
  const [disputeType, setDisputeType] = useState('');
  const [reason, setReason] = useState('');
  const [driverCodes, setDriverCodes] = useState('');
  const [errors, setErrors] = useState({});
  const qc = useQueryClient();

  const { mutate: submit, isPending: isLoading } = useMutation({
    mutationFn: (data) => raiseBatchDispute(batch._id, data),
    onSuccess: () => {
      toast.success('Dispute raised. Accounts team notified.');
      qc.invalidateQueries(['batch-approvals', batch._id]);
      qc.invalidateQueries(['batch-disputes', batch._id]);
      qc.invalidateQueries(['attendance-batches']);
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to raise dispute'),
  });

  const handleSubmit = () => {
    const newErrors = {};
    if (!disputeType) newErrors.disputeType = 'Select a dispute type';
    if (reason.length < 10) newErrors.reason = 'Reason must be at least 10 characters';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const codes = driverCodes.split(',').map(c => c.trim()).filter(Boolean);
    submit({
      disputeType,
      reason,
      disputedDriverCodes: codes.length > 0 ? codes : undefined,
    });
  };

  return (
    <Modal title="Raise attendance dispute" onClose={onClose} width={500}>
      <div style={{
        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#fbbf24',
      }}>
        Raising a dispute will pause the approval process. The Accounts team will be notified to respond.
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Dispute type *</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
          {DISPUTE_TYPES.map(dt => (
            <div
              key={dt.value}
              onClick={() => { setDisputeType(dt.value); setErrors(e => ({ ...e, disputeType: undefined })); }}
              style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                border: disputeType === dt.value
                  ? '2px solid var(--accent)'
                  : '1px solid var(--border2)',
                background: disputeType === dt.value
                  ? 'rgba(79,142,247,0.06)'
                  : 'var(--surface2)',
                fontWeight: disputeType === dt.value ? 500 : 400,
              }}
            >
              {dt.label}
            </div>
          ))}
        </div>
        {errors.disputeType && (
          <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{errors.disputeType}</div>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
          Which drivers are affected? (optional)
        </label>
        <input
          type="text"
          value={driverCodes}
          onChange={(e) => setDriverCodes(e.target.value)}
          placeholder="EMP001, EMP002, ..."
          style={{
            width: '100%', borderRadius: 8, border: '1px solid var(--border2)',
            background: 'var(--surface)', color: 'var(--text)', padding: '8px 10px', fontSize: 13,
          }}
        />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
          Leave blank if the dispute affects the whole batch.
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
          Describe the issue *
        </label>
        <textarea
          value={reason}
          onChange={(e) => { setReason(e.target.value); if (e.target.value.length >= 10) setErrors(er => ({ ...er, reason: undefined })); }}
          placeholder="Describe the issue in detail..."
          style={{
            width: '100%', minHeight: 100, resize: 'vertical', borderRadius: 8,
            border: `1px solid ${errors.reason ? 'rgba(239,68,68,0.5)' : 'var(--border2)'}`,
            background: 'var(--surface)', color: 'var(--text)', padding: '8px 10px', fontSize: 13,
          }}
          maxLength={500}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          {errors.reason ? (
            <span style={{ fontSize: 11, color: '#f87171' }}>{errors.reason}</span>
          ) : <span />}
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{reason.length} / 500</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" onClick={handleSubmit} disabled={isLoading}>
          {isLoading ? 'Submitting...' : '⚑ Submit dispute'}
        </Btn>
      </div>
    </Modal>
  );
};

export default DisputeModal;
