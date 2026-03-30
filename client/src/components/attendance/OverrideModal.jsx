import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import { overrideRecord } from '../../api/attendanceApi';

const OverrideModal = ({ record, batchId, onClose, onSuccess }) => {
  const [reason, setReason] = useState('');
  const [workingDays, setWorkingDays] = useState(record.workingDays ?? '');
  const [overtimeHours, setOvertimeHours] = useState(record.overtimeHours ?? '');
  const [totalOrders, setTotalOrders] = useState(record.totalOrders ?? '');
  const qc = useQueryClient();

  const { mutate: override, isPending: isLoading } = useMutation({
    mutationFn: () => {
      const data = { reason };
      if (workingDays !== '' && Number(workingDays) !== record.workingDays) {
        data.workingDays = Number(workingDays);
      }
      if (overtimeHours !== '' && Number(overtimeHours) !== record.overtimeHours) {
        data.overtimeHours = Number(overtimeHours);
      }
      if (totalOrders !== '' && Number(totalOrders) !== record.totalOrders) {
        data.totalOrders = Number(totalOrders);
      }
      return overrideRecord(record._id, data);
    },
    onSuccess: () => {
      toast.success('Record overridden successfully');
      qc.invalidateQueries(['batch-detail', batchId]);
      qc.invalidateQueries(['attendance-batches']);
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to override record'),
  });

  const employeeCode = record.driverId?.employeeCode || record.rawEmployeeCode || '—';
  const driverName = record.driverId?.fullName || '—';
  const issues = record.issues || [];

  return (
    <Modal title="Override attendance record" onClose={onClose} width={440}>
      <div style={{
        background: 'var(--surface2)', borderRadius: 8, padding: 14, marginBottom: 16,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Employee code</div>
            <div style={{ fontSize: 13, marginTop: 2, fontFamily: 'var(--mono)' }}>{employeeCode}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Driver</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{driverName}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Current status</div>
            <div style={{ fontSize: 13, marginTop: 2, color: record.status === 'error' ? '#f87171' : record.status === 'warning' ? '#fbbf24' : 'var(--text)' }}>
              {record.status}
            </div>
          </div>
          {issues.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Issues</div>
              <div style={{ fontSize: 12, marginTop: 2, color: '#f87171' }}>
                {issues.join(', ')}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
            Working days
          </label>
          <input
            type="number"
            min="0"
            max="31"
            value={workingDays}
            onChange={(e) => setWorkingDays(e.target.value)}
            placeholder={String(record.workingDays ?? 0)}
            style={{
              width: '100%', borderRadius: 8, border: '1px solid var(--border2)',
              background: 'var(--surface)', color: 'var(--text)', padding: '8px 10px', fontSize: 13,
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
            Overtime hours
          </label>
          <input
            type="number"
            min="0"
            max="500"
            step="0.5"
            value={overtimeHours}
            onChange={(e) => setOvertimeHours(e.target.value)}
            placeholder={String(record.overtimeHours ?? 0)}
            style={{
              width: '100%', borderRadius: 8, border: '1px solid var(--border2)',
              background: 'var(--surface)', color: 'var(--text)', padding: '8px 10px', fontSize: 13,
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
            Total orders
          </label>
          <input
            type="number"
            min="0"
            value={totalOrders}
            onChange={(e) => setTotalOrders(e.target.value)}
            placeholder={String(record.totalOrders ?? 0)}
            style={{
              width: '100%', borderRadius: 8, border: '1px solid var(--border2)',
              background: 'var(--surface)', color: 'var(--text)', padding: '8px 10px', fontSize: 13,
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
          Reason for override *
        </label>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why this record is being overridden..."
          style={{
            width: '100%', resize: 'vertical', borderRadius: 8,
            border: '1px solid var(--border2)', background: 'var(--surface)',
            color: 'var(--text)', padding: '8px 10px', fontSize: 13,
          }}
        />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
          Minimum 3 characters required
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn
          variant="warning"
          onClick={() => override()}
          disabled={isLoading || reason.trim().length < 3}
        >
          {isLoading ? 'Overriding...' : 'Override record'}
        </Btn>
      </div>
    </Modal>
  );
};

export default OverrideModal;
