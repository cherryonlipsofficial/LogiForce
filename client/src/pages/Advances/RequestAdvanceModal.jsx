import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';
import Btn from '../../components/ui/Btn';
import { requestAdvance } from '../../api/advancesApi';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const RequestAdvanceModal = ({ driver, onClose, onSuccess }) => {
  const { isMobile } = useBreakpoint();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const qc = useQueryClient();

  const baseSalary = Number(driver.baseSalary) || 0;
  const maxRecommended = Math.floor(baseSalary * 0.5);

  const { mutate: submit, isLoading } = useMutation({
    mutationFn: () => requestAdvance({
      driverId: driver._id,
      projectId: driver.projectId?._id || driver.projectId,
      clientId: driver.clientId?._id || driver.clientId,
      amount: Number(amount),
      reason,
    }),
    onSuccess: () => {
      toast.success('Advance request submitted. Accounts will review.');
      qc.invalidateQueries(['advances']);
      qc.invalidateQueries(['driver-advances', driver._id]);
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to submit advance request'),
  });

  const handleSubmit = () => {
    if (!amount || Number(amount) < 1) {
      setError('Amount must be at least AED 1');
      return;
    }
    if (!reason.trim()) {
      setError('Please provide a reason');
      return;
    }
    setError('');
    submit();
  };

  const driverName = driver.fullName || driver.name || 'Unknown';
  const driverCode = driver.employeeCode || '';
  const projectName = driver.projectId?.name || driver.project || '—';
  const clientName = driver.clientId?.name || driver.client || '—';

  return (
    <Modal title={`Request advance for ${driverName}`} onClose={onClose} width={440}>
      {/* Driver info card */}
      <div style={{
        background: 'var(--surface2)', borderRadius: 8, padding: 14, marginBottom: 16,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Name</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{driverName}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Code</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{driverCode}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Project</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{projectName}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Client</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{clientName}</div>
          </div>
          {baseSalary > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Base salary</div>
              <div style={{ fontSize: 13, marginTop: 2, fontFamily: 'var(--mono)' }}>AED {baseSalary.toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>

      {/* Amount */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
          Amount (AED) *
        </label>
        <input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--border2)', background: 'var(--surface)',
            color: 'var(--text)', fontSize: 14,
          }}
        />
        {baseSalary > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
            Maximum recommended: 50% of monthly salary (AED {maxRecommended.toLocaleString()})
          </div>
        )}
      </div>

      {/* Reason */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
          Reason *
        </label>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this advance being requested..."
          style={{
            width: '100%', resize: 'vertical', borderRadius: 8,
            border: '1px solid var(--border2)', background: 'var(--surface)',
            color: 'var(--text)', padding: '8px 10px', fontSize: 13,
          }}
        />
      </div>

      <div style={{
        background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
        borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 11, color: 'var(--text3)',
      }}>
        This request will be sent to Accounts for approval. Recovery schedule will be set by Accounts on approval.
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={handleSubmit} disabled={isLoading}>
          {isLoading ? 'Submitting...' : 'Submit request'}
        </Btn>
      </div>
    </Modal>
  );
};

export default RequestAdvanceModal;
