import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import { approveBatch } from '../../api/attendanceApi';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const ApproveModal = ({ batch, onClose, onSuccess }) => {
  const { isMobile } = useBreakpoint();
  const [notes, setNotes] = useState('');
  const qc = useQueryClient();

  const { mutate: approve, isPending: isLoading } = useMutation({
    mutationFn: () => approveBatch(batch._id, notes),
    onSuccess: (res) => {
      const newStatus = res?.data?.status || res?.status;
      if (newStatus === 'fully_approved') {
        toast.success('Both teams approved! Invoice can now be generated.');
      } else {
        toast.success('Your approval recorded. Waiting for other team.');
      }
      qc.invalidateQueries(['batch-approvals', batch._id]);
      qc.invalidateQueries(['attendance-batches']);
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to approve'),
  });

  const displayPeriod = batch.period?.year
    ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][(batch.period.month || 1) - 1]} ${batch.period.year}`
    : batch.period;

  return (
    <Modal title="Approve attendance" onClose={onClose} width={420}>
      <div style={{
        background: 'var(--surface2)', borderRadius: 8, padding: 14, marginBottom: 16,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Client</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{batch.clientId?.name || batch.client || 'Unknown'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Period</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{displayPeriod}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Total drivers</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{batch.totalRows ?? batch.totalRecords ?? 0}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Matched</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{batch.matchedRows ?? batch.validRecords ?? 0}</div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
          Notes (optional)
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any comments about this approval..."
          style={{
            width: '100%', resize: 'vertical', borderRadius: 8,
            border: '1px solid var(--border2)', background: 'var(--surface)',
            color: 'var(--text)', padding: '8px 10px', fontSize: 13,
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="success" onClick={() => approve()} disabled={isLoading}>
          {isLoading ? 'Approving...' : '✓ Approve attendance'}
        </Btn>
      </div>
    </Modal>
  );
};

export default ApproveModal;
