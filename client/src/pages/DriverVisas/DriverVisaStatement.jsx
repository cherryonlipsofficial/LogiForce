import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '../../components/ui/Modal';
import Btn from '../../components/ui/Btn';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { useFormatters } from '../../hooks/useFormatters';
import { formatDate } from '../../utils/formatters';
import {
  getDriverVisa,
  addDriverVisaLineItem,
  removeDriverVisaLineItem,
  logDriverVisaProcessing,
  updateDriverVisaFinancials,
  waiveDriverVisa,
  cancelDriverVisa,
} from '../../api/driverVisasApi';

const fmt = (n) => {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Full-screen statement view of a driver's visa — shows a ledger-style
 * statement with expenses on the left, received on the right, running
 * balance, plus the processing/expiry highlight and inline actions.
 */
const DriverVisaStatement = ({ visaId, onClose }) => {
  const { hasPermission } = useAuth();
  const { n } = useFormatters();
  const queryClient = useQueryClient();

  const canManage = hasPermission('driver_visas.manage');
  const canLogProcessing = hasPermission('driver_visas.log_processing');

  const [addingLine, setAddingLine] = useState(null); // 'expense' | 'received' | null
  const [form, setForm] = useState({ label: '', amount: '', date: '', notes: '' });
  const [procDate, setProcDate] = useState('');
  const [editingPlan, setEditingPlan] = useState(false);
  const [plan, setPlan] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ['driver-visa', visaId],
    queryFn: () => getDriverVisa(visaId),
    enabled: !!visaId,
  });

  const visa = data?.data;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['driver-visa', visaId] });
    queryClient.invalidateQueries({ queryKey: ['driver-visas'] });
  };

  const addLineMut = useMutation({
    mutationFn: (payload) => addDriverVisaLineItem(visaId, payload),
    onSuccess: () => {
      invalidate();
      setAddingLine(null);
      setForm({ label: '', amount: '', date: '', notes: '' });
    },
  });

  const removeLineMut = useMutation({
    mutationFn: (lineItemId) => removeDriverVisaLineItem(visaId, lineItemId),
    onSuccess: invalidate,
  });

  const logProcMut = useMutation({
    mutationFn: (payload) => logDriverVisaProcessing(visaId, payload),
    onSuccess: () => {
      invalidate();
      setProcDate('');
    },
  });

  const updatePlanMut = useMutation({
    mutationFn: (payload) => updateDriverVisaFinancials(visaId, payload),
    onSuccess: () => {
      invalidate();
      setEditingPlan(false);
    },
  });

  const waiveMut = useMutation({
    mutationFn: (reason) => waiveDriverVisa(visaId, { reason }),
    onSuccess: invalidate,
  });

  const cancelMut = useMutation({
    mutationFn: (reason) => cancelDriverVisa(visaId, { reason }),
    onSuccess: invalidate,
  });

  if (isLoading || !visa) {
    return (
      <Modal onClose={onClose} title="Visa Statement" width={760}>
        <LoadingSpinner />
      </Modal>
    );
  }

  const driver = visa.driverId || {};
  const sortedItems = [...(visa.lineItems || [])].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  // Build a running balance (expense minus received per row, cumulative).
  let running = 0;
  const rows = sortedItems.map((li) => {
    const amt = Number(li.amount) || 0;
    running += li.direction === 'expense' ? amt : -amt;
    return { ...li, balance: running };
  });

  const totalExpense = Number(visa.totalExpense || 0);
  const totalReceived = Number(visa.totalReceived || 0);
  const balance = Number(visa.statementBalance || 0);

  const daysLeft = visa.daysUntilExpiry;
  const expiryBanner = (() => {
    if (!visa.expiryDate) return null;
    if (daysLeft != null && daysLeft < 0) {
      return { bg: '#7f1d1d', color: '#fecaca', text: `Expired ${Math.abs(daysLeft)} day(s) ago` };
    }
    if (daysLeft != null && daysLeft <= 30) {
      return { bg: '#78350f', color: '#fde68a', text: `Expiring in ${daysLeft} day(s)` };
    }
    return null;
  })();

  const statusVariant = {
    active: 'success',
    fully_recovered: 'info',
    waived: 'default',
    cancelled: 'danger',
  }[visa.status] || 'default';

  // Statement header — mirrors the reference image caption line
  const header = [
    driver.fullName || 'Unknown driver',
    visa.referenceName ? `${visa.referenceName} Ref` : null,
    visa.visaLabel || (visa.visaCategory === 'twp' ? 'TWP' : 'Company Visa'),
  ]
    .filter(Boolean)
    .join(' - ');

  return (
    <Modal onClose={onClose} title="Visa Statement" width={820}>
      {/* Header banner */}
      <div
        style={{
          background: '#166534',
          color: '#ecfdf5',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 14,
          fontWeight: 600,
          textAlign: 'center',
          marginBottom: 14,
        }}
      >
        {header}
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, fontSize: 12 }}>
        <div>
          <span style={{ color: 'var(--text3)' }}>Status: </span>
          <Badge variant={statusVariant}>{visa.status}</Badge>
        </div>
        <div>
          <span style={{ color: 'var(--text3)' }}>Employee: </span>
          <span style={{ fontWeight: 500 }}>{driver.employeeCode || '—'}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text3)' }}>Visa #: </span>
          <span style={{ fontWeight: 500 }}>{visa.visaNumber || '—'}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text3)' }}>Issued: </span>
          <span>{formatDate(visa.issueDate)}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text3)' }}>Expires: </span>
          <span>{formatDate(visa.expiryDate)}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text3)' }}>Monthly deduction: </span>
          <span style={{ fontWeight: 500 }}>{fmt(visa.monthlyDeduction)} AED</span>
        </div>
      </div>

      {/* Processing + expiry highlights */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {visa.visaProcessedDate ? (
          <div
            style={{
              background: '#064e3b',
              color: '#a7f3d0',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: '1px solid #065f46',
            }}
          >
            <span style={{ fontSize: 14 }}>✓</span>
            <span>Processed on <strong>{formatDate(visa.visaProcessedDate)}</strong></span>
            {visa.visaProcessedBy?.name && (
              <span style={{ opacity: 0.7 }}>by {visa.visaProcessedBy.name}</span>
            )}
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(251,191,36,0.12)',
              color: '#fbbf24',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              border: '1px dashed rgba(251,191,36,0.4)',
            }}
          >
            Visa not yet processed
          </div>
        )}
        {expiryBanner && (
          <div
            style={{
              background: expiryBanner.bg,
              color: expiryBanner.color,
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            ⚠ {expiryBanner.text}
          </div>
        )}
      </div>

      {/* Log processing inline (Operations) */}
      {canLogProcessing && !visa.visaProcessedDate && visa.status === 'active' && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginBottom: 14,
            padding: 10,
            background: 'var(--surface2)',
            borderRadius: 8,
            border: '1px solid var(--border)',
          }}
        >
          <label style={{ fontSize: 12, color: 'var(--text3)' }}>Log processing date:</label>
          <input
            type="date"
            value={procDate}
            onChange={(e) => setProcDate(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--border2)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 12,
            }}
          />
          <Btn
            small
            variant="primary"
            onClick={() => logProcMut.mutate({ processedDate: procDate || undefined })}
            disabled={logProcMut.isLoading}
          >
            Save
          </Btn>
        </div>
      )}

      {/* Statement table */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: 10,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', width: '42%' }}>Details</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Expense</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Received</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Balance</th>
              {canManage && <th style={{ padding: '10px 12px', width: 40 }} />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={canManage ? 5 : 4} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>
                  No line items yet. Add charges or received payments to build the statement.
                </td>
              </tr>
            )}
            {rows.map((li) => {
              const isExpense = li.direction === 'expense';
              const bg =
                li.source === 'salary_deduction'
                  ? 'rgba(59,130,246,0.06)'
                  : isExpense
                    ? 'rgba(234,179,8,0.06)'
                    : 'transparent';
              return (
                <tr key={li._id} style={{ borderTop: '1px solid var(--border)', background: bg }}>
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ fontWeight: 500 }}>{li.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                      {formatDate(li.date)}
                      {li.source === 'salary_deduction' && (
                        <Badge variant="info" style={{ marginLeft: 6, fontSize: 9 }}>auto</Badge>
                      )}
                      {li.notes && <span style={{ marginLeft: 6 }}>· {li.notes}</span>}
                    </div>
                  </td>
                  <td style={{
                    padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)',
                    color: isExpense ? '#facc15' : 'var(--text3)',
                  }}>
                    {isExpense ? n(fmt(li.amount)) : ''}
                  </td>
                  <td style={{
                    padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)',
                    color: !isExpense ? '#4ade80' : 'var(--text3)',
                  }}>
                    {!isExpense ? n(fmt(li.amount)) : ''}
                  </td>
                  <td style={{
                    padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)',
                    color: li.balance >= 0 ? 'var(--text)' : '#4ade80',
                  }}>
                    {n(fmt(li.balance))}
                  </td>
                  {canManage && (
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      {li.source !== 'salary_deduction' && (
                        <button
                          onClick={() => {
                            if (confirm('Remove this line item?')) removeLineMut.mutate(li._id);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text3)',
                            cursor: 'pointer',
                            fontSize: 14,
                          }}
                          title="Remove"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--surface2)', fontWeight: 600 }}>
              <td style={{ padding: '10px 12px' }}>Totals</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>
                {n(fmt(totalExpense))}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>
                {n(fmt(totalReceived))}
              </td>
              <td
                style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  fontFamily: 'var(--mono)',
                  color: balance > 0 ? '#facc15' : '#4ade80',
                }}
              >
                {n(fmt(balance))}
              </td>
              {canManage && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Add line item controls */}
      {canManage && visa.status === 'active' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <Btn small variant="secondary" onClick={() => setAddingLine('expense')}>+ Add Expense</Btn>
          <Btn small variant="secondary" onClick={() => setAddingLine('received')}>+ Add Received</Btn>
          <Btn small variant="ghost" onClick={() => { setEditingPlan(true); setPlan({
            totalCost: visa.totalCost,
            medicalInsuranceCost: visa.medicalInsuranceCost,
            discountAmount: visa.discountAmount,
            cashPaid: visa.cashPaid,
            monthlyDeduction: visa.monthlyDeduction,
          }); }}>Edit plan</Btn>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <Btn small variant="ghost" onClick={() => {
              const reason = prompt('Reason to waive remaining balance?');
              if (reason != null) waiveMut.mutate(reason);
            }}>Waive</Btn>
            <Btn small variant="danger" onClick={() => {
              const reason = prompt('Reason to cancel this visa record?');
              if (reason != null) cancelMut.mutate(reason);
            }}>Cancel record</Btn>
          </div>
        </div>
      )}

      {addingLine && (
        <div
          style={{
            padding: 12,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--surface2)',
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: 'capitalize' }}>
            New {addingLine}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
            <input
              type="text"
              placeholder="Label (e.g. ILOE Fine, Cash Payment)"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              style={inputStyle}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              style={inputStyle}
            />
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              style={inputStyle}
            />
          </div>
          <input
            type="text"
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            style={{ ...inputStyle, marginTop: 8, width: '100%' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
            <Btn small variant="ghost" onClick={() => setAddingLine(null)}>Cancel</Btn>
            <Btn
              small
              variant="primary"
              disabled={!form.label || !form.amount || addLineMut.isLoading}
              onClick={() =>
                addLineMut.mutate({
                  direction: addingLine,
                  label: form.label,
                  amount: parseFloat(form.amount),
                  date: form.date || undefined,
                  notes: form.notes || undefined,
                })
              }
            >
              Save
            </Btn>
          </div>
          {addLineMut.isError && (
            <div style={{ color: '#f87171', fontSize: 11, marginTop: 6 }}>
              {addLineMut.error?.response?.data?.message || addLineMut.error?.message}
            </div>
          )}
        </div>
      )}

      {editingPlan && (
        <div
          style={{
            padding: 12,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--surface2)',
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Edit visa plan</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {[
              ['totalCost', 'Total charges (AED)'],
              ['medicalInsuranceCost', 'Medical insurance (AED)'],
              ['discountAmount', 'Discount / waive-off (AED)'],
              ['cashPaid', 'Cash received upfront (AED)'],
              ['monthlyDeduction', 'Monthly deduction (AED)'],
            ].map(([key, label]) => (
              <label key={key} style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {label}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={plan[key] ?? 0}
                  onChange={(e) => setPlan({ ...plan, [key]: parseFloat(e.target.value) || 0 })}
                  style={inputStyle}
                />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
            <Btn small variant="ghost" onClick={() => setEditingPlan(false)}>Cancel</Btn>
            <Btn
              small
              variant="primary"
              disabled={updatePlanMut.isLoading}
              onClick={() => updatePlanMut.mutate(plan)}
            >
              Save plan
            </Btn>
          </div>
          {updatePlanMut.isError && (
            <div style={{ color: '#f87171', fontSize: 11, marginTop: 6 }}>
              {updatePlanMut.error?.response?.data?.message || updatePlanMut.error?.message}
            </div>
          )}
        </div>
      )}

      {/* Recovery summary vs agreed plan */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          fontSize: 11,
        }}
      >
        <div style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ color: 'var(--text3)' }}>Recoverable (plan)</div>
          <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 13 }}>
            {n(fmt(visa.recoverableAmount))} AED
          </div>
        </div>
        <div style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ color: 'var(--text3)' }}>Recovered via salary</div>
          <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 13, color: '#4ade80' }}>
            {n(fmt(visa.totalRecovered))} AED
          </div>
        </div>
        <div style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ color: 'var(--text3)' }}>Outstanding</div>
          <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 13, color: '#facc15' }}>
            {n(fmt(visa.outstandingAmount))} AED
          </div>
        </div>
      </div>

      {visa.remarks && (
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)', whiteSpace: 'pre-wrap' }}>
          <strong>Remarks:</strong> {visa.remarks}
        </div>
      )}
    </Modal>
  );
};

const inputStyle = {
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid var(--border2)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 12,
  width: '100%',
};

export default DriverVisaStatement;
