import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';
import Btn from '../../components/ui/Btn';
import { reviewAdvance } from '../../api/advancesApi';
import { useFormatters } from '../../hooks/useFormatters';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const getNextMonth = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1 + offset);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

const AdvanceReviewModal = ({ advance, decision, onClose, onSuccess }) => {
  const [notes, setNotes] = useState('');
  const [schedule, setSchedule] = useState([{ ...getNextMonth(0), amount: advance.amount || 0 }]);
  const [error, setError] = useState('');
  const { n } = useFormatters();
  const qc = useQueryClient();

  const isApprove = decision === 'approved';
  const amount = Number(advance.amount) || 0;

  const scheduleSum = useMemo(
    () => schedule.reduce((s, i) => s + (Number(i.amount) || 0), 0),
    [schedule]
  );

  const { mutate: submit, isPending: isLoading } = useMutation({
    mutationFn: () => reviewAdvance(advance._id, {
      decision,
      reviewNotes: notes,
      ...(isApprove ? { recoverySchedule: schedule.map(s => ({ period: { year: s.year, month: s.month }, amountToRecover: Number(s.amount) })) } : {}),
    }),
    onSuccess: () => {
      toast.success(`Advance ${decision}`);
      qc.invalidateQueries(['advances']);
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to review advance'),
  });

  const handleSubmit = () => {
    if (!isApprove && notes.length < 1) {
      setError('Please provide a reason for rejection');
      return;
    }
    if (isApprove && Math.abs(scheduleSum - amount) > 0.01) {
      setError(`Recovery schedule total (AED ${n(scheduleSum.toLocaleString())}) must equal advance amount (AED ${n(amount.toLocaleString())})`);
      return;
    }
    setError('');
    submit();
  };

  const addInstallment = () => {
    const last = schedule[schedule.length - 1] || getNextMonth(-1);
    const next = new Date(last.year, last.month); // month is 0-indexed here, but last.month is 1-indexed so it adds 1
    setSchedule([...schedule, { year: next.getFullYear(), month: next.getMonth() + 1, amount: 0 }]);
  };

  const removeInstallment = (idx) => {
    setSchedule(schedule.filter((_, i) => i !== idx));
  };

  const updateInstallment = (idx, field, value) => {
    setSchedule(schedule.map((s, i) => i === idx ? { ...s, [field]: field === 'amount' ? value : Number(value) } : s));
  };

  const quickFill = (count) => {
    const perInstallment = Math.floor((amount / count) * 100) / 100;
    const remainder = Math.round((amount - perInstallment * count) * 100) / 100;
    const items = [];
    for (let i = 0; i < count; i++) {
      const m = getNextMonth(i);
      items.push({ ...m, amount: i === count - 1 ? perInstallment + remainder : perInstallment });
    }
    setSchedule(items);
  };

  const driverName = advance.driverId?.fullName || advance.driverName || 'Unknown';
  const driverCode = advance.driverId?.employeeCode || advance.driverCode || '';

  return (
    <Modal title={isApprove ? 'Approve advance' : 'Reject advance'} onClose={onClose} width={520}>
      {/* Driver summary */}
      <div style={{
        background: 'var(--surface2)', borderRadius: 8, padding: 14, marginBottom: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{driverName}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{driverCode}</div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: isApprove ? '#4ade80' : '#f87171', fontFamily: 'var(--mono)' }}>
          AED {n(amount.toLocaleString())}
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
          Review notes {!isApprove ? '*' : '(optional)'}
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={isApprove ? 'Any comments...' : 'Reason for rejection...'}
          style={{
            width: '100%', resize: 'vertical', borderRadius: 8,
            border: '1px solid var(--border2)', background: 'var(--surface)',
            color: 'var(--text)', padding: '8px 10px', fontSize: 13,
          }}
        />
      </div>

      {/* Recovery schedule (only for approval) */}
      {isApprove && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Recovery schedule</label>
            <span style={{
              fontSize: 11,
              color: Math.abs(scheduleSum - amount) < 0.01 ? '#4ade80' : '#f59e0b',
              fontFamily: 'var(--mono)',
            }}>
              AED {n(scheduleSum.toLocaleString())} of AED {n(amount.toLocaleString())}
            </span>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
            Total must equal AED {n(amount.toLocaleString())}
          </div>

          {/* Quick fill buttons */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <Btn small variant="ghost" onClick={() => quickFill(1)}>Single salary</Btn>
            <Btn small variant="ghost" onClick={() => quickFill(2)}>2 salaries</Btn>
            <Btn small variant="ghost" onClick={() => quickFill(3)}>3 salaries</Btn>
          </div>

          {/* Installment rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {schedule.map((inst, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={inst.year}
                  onChange={(e) => updateInstallment(idx, 'year', e.target.value)}
                  style={{ width: 90, height: 34 }}
                >
                  {[2025, 2026, 2027, 2028].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select
                  value={inst.month}
                  onChange={(e) => updateInstallment(idx, 'month', e.target.value)}
                  style={{ flex: 1, height: 34 }}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
                <div style={{ position: 'relative', width: 130 }}>
                  <span style={{
                    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 11, color: 'var(--text3)', pointerEvents: 'none',
                  }}>AED</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={inst.amount}
                    onChange={(e) => updateInstallment(idx, 'amount', e.target.value)}
                    style={{ width: '100%', paddingLeft: 38, height: 34 }}
                  />
                </div>
                {schedule.length > 1 && (
                  <button
                    onClick={() => removeInstallment(idx)}
                    style={{
                      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                      color: '#f87171', borderRadius: 6, width: 28, height: 28,
                      cursor: 'pointer', fontSize: 14, flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={addInstallment}
            style={{
              marginTop: 8, background: 'transparent', border: '1px dashed var(--border2)',
              borderRadius: 8, padding: '6px 12px', fontSize: 12, color: 'var(--accent)',
              cursor: 'pointer', width: '100%',
            }}
          >
            + Add installment
          </button>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: '#f87171', marginBottom: 12, background: 'rgba(239,68,68,0.06)', padding: '8px 12px', borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant={isApprove ? 'success' : 'danger'} onClick={handleSubmit} disabled={isLoading}>
          {isLoading ? 'Processing...' : `Confirm ${decision}`}
        </Btn>
      </div>
    </Modal>
  );
};

export default AdvanceReviewModal;
