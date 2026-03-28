import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import { respondToDispute } from '../../api/attendanceApi';
import { formatDate } from '../../utils/formatters';

const DISPUTE_TYPE_LABELS = {
  incorrect_days: 'Incorrect working days',
  missing_driver: 'Driver missing from attendance',
  extra_driver: 'Unknown driver in attendance',
  overtime_mismatch: 'Overtime hours incorrect',
  other: 'Other issue',
};

const DisputeResponseModal = ({ dispute, onClose, onSuccess }) => {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const qc = useQueryClient();

  const { mutate: submit, isLoading } = useMutation({
    mutationFn: () => respondToDispute(dispute._id, message),
    onSuccess: () => {
      toast.success('Response sent. Reviewer has been notified.');
      qc.invalidateQueries(['batch-disputes', dispute.batchId]);
      qc.invalidateQueries(['batch-approvals', dispute.batchId]);
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to send response'),
  });

  const handleSubmit = () => {
    if (message.length < 10) {
      setError('Response must be at least 10 characters');
      return;
    }
    setError('');
    submit();
  };

  return (
    <Modal title="Respond to dispute" onClose={onClose} width={460}>
      <div style={{
        background: 'var(--surface2)', borderRadius: 8, padding: 14, marginBottom: 16,
      }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Raised by: </span>
            <span style={{ fontSize: 12 }}>
              {dispute.raisedBy?.name || 'Unknown'} ({dispute.raisedBy?.role || dispute.raisedByRole || '—'})
            </span>
          </div>
          <div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Date: </span>
            <span style={{ fontSize: 12 }}>{formatDate(dispute.raisedAt || dispute.createdAt)}</span>
          </div>
          <div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Type: </span>
            <span style={{ fontSize: 12 }}>{DISPUTE_TYPE_LABELS[dispute.disputeType] || dispute.disputeType}</span>
          </div>
          <div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Reason: </span>
            <span style={{ fontSize: 12, fontStyle: 'italic' }}>"{dispute.reason}"</span>
          </div>
          <div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Affected drivers: </span>
            <span style={{ fontSize: 12 }}>
              {dispute.disputedDriverCodes?.length > 0
                ? dispute.disputedDriverCodes.join(', ')
                : 'Entire batch'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
          Your response *
        </label>
        <textarea
          value={message}
          onChange={(e) => { setMessage(e.target.value); if (e.target.value.length >= 10) setError(''); }}
          placeholder="Explain what was checked, corrected, or clarify why the data is correct..."
          style={{
            width: '100%', minHeight: 120, resize: 'vertical', borderRadius: 8,
            border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'var(--border2)'}`,
            background: 'var(--surface)', color: 'var(--text)', padding: '8px 10px', fontSize: 13,
          }}
        />
        {error && <div style={{ fontSize: 11, color: '#f87171', marginTop: 3 }}>{error}</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={handleSubmit} disabled={isLoading}>
          {isLoading ? 'Sending...' : 'Send response'}
        </Btn>
      </div>
    </Modal>
  );
};

export default DisputeResponseModal;
