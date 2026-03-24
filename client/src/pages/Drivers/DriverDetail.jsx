import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import SidePanel from '../../components/ui/SidePanel';
import Avatar from '../../components/ui/Avatar';
import StatusBadge from '../../components/ui/StatusBadge';
import Badge from '../../components/ui/Badge';
import SectionHeader from '../../components/ui/SectionHeader';
import Btn from '../../components/ui/Btn';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { getDriverLedger, updateDriver, changeDriverStatus } from '../../api/driversApi';
import { getClients } from '../../api/clientsApi';

const tabs = ['profile', 'financial', 'documents', 'history'];

const DriverDetail = ({ driver, onClose }) => {
  const [tab, setTab] = useState('profile');
  const [showEdit, setShowEdit] = useState(false);
  const [showStatusChange, setShowStatusChange] = useState(false);
  const queryClient = useQueryClient();

  const d = driver;
  const driverName = d.fullName || d.name || '';
  const driverClient = d.clientId?.name || d.client || '';
  const driverSupplier = d.supplierId?.name || d.supplier || '';
  const initials = driverName
    ? driverName.split(' ').map((n) => n[0]).join('').toUpperCase()
    : '??';

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['driverLedger', d._id || d.id],
    queryFn: () => getDriverLedger(d._id || d.id),
    enabled: tab === 'financial',
  });

  const ledger = ledgerData?.data || [
    { date: 'Mar 2026', type: 'credit', description: 'Net salary — March 2026', amount: 2313, ref: 'SAL-2026-03' },
    { date: 'Mar 2026', type: 'debit', description: 'SIM deduction — Etisalat', amount: -75, ref: 'DED-ETI-MAR' },
    { date: 'Mar 2026', type: 'debit', description: 'Salik tolls — February', amount: -112, ref: 'DED-SAL-FEB' },
    { date: 'Mar 2026', type: 'debit', description: 'Advance recovery (50%)', amount: -300, ref: 'ADV-2026-0041' },
    { date: 'Feb 2026', type: 'credit', description: 'Net salary — February 2026', amount: 2200, ref: 'SAL-2026-02' },
    { date: 'Jan 2026', type: 'debit', description: 'Advance issued', amount: -1000, ref: 'ADV-2026-0041' },
    { date: 'Jan 2026', type: 'credit', description: 'Net salary — January 2026', amount: 2450, ref: 'SAL-2026-01' },
  ];

  const documents = [
    { label: 'Emirates ID', expiry: '14 Feb 2028', status: 'success' },
    { label: 'Passport', expiry: '12 Jan 2029', status: 'success' },
    { label: 'UAE Residence Visa', expiry: d.visaExpiry || '15 Apr 2026', status: 'warning' },
    { label: 'Labour card', expiry: '02 Mar 2025', status: 'success' },
    { label: 'UAE Driving Licence', expiry: '18 Nov 2027', status: 'success' },
    { label: 'Mulkiya (vehicle reg.)', expiry: '30 Apr 2026', status: 'warning' },
  ];

  const history = [
    { date: d.joinDate || '03 Mar 2023', event: `Joined — ${driverClient || 'Amazon UAE'}`, detail: `Status: Active · Base: AED ${(d.baseSalary || 2800).toLocaleString()}/mo` },
    { date: '14 Jul 2024', event: 'Reassigned from Noon to Amazon UAE', detail: 'Reason: Client reallocation · Changed by: Sarah K.' },
    { date: '01 Nov 2024', event: 'On leave → Active', detail: 'Annual leave 14 days · Approved by: Ops Mgr' },
    { date: '10 Jan 2026', event: 'Salary updated: AED 2,600 → 2,800', detail: 'Annual increment · Approved by: Finance Director' },
  ];

  const grossSalary = d.grossSalary || d.baseSalary || 2800;
  const deductionsAmt = d.deductions || 487;
  const netSalary = d.netSalary || grossSalary - deductionsAmt;
  const workingDays = d.workingDays ?? 22;
  const advanceBalance = d.advanceBalance || 0;

  return (
    <SidePanel onClose={onClose} width={480}>
      {/* Header */}
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Avatar initials={initials} size={44} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{driverName}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {d.employeeCode || d.id} · {driverClient}
            </div>
          </div>
          <StatusBadge status={d.status || 'active'} />
          <button
            onClick={onClose}
            style={{
              background: 'var(--surface3)',
              border: '1px solid var(--border2)',
              color: 'var(--text2)',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            &times;
          </button>
        </div>
        <div
          style={{
            background: 'linear-gradient(135deg,rgba(29,179,136,0.1),rgba(79,142,247,0.08))',
            border: '1px solid rgba(29,179,136,0.2)',
            borderRadius: 10,
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              March 2026 net pay
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#4ade80', letterSpacing: '-0.5px' }}>
              AED {netSalary.toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Working days</div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>{workingDays}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 14px',
              fontSize: 12,
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text3)',
              fontWeight: tab === t ? 500 : 400,
              cursor: 'pointer',
              transition: 'all .15s',
              textTransform: 'capitalize',
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {tab === 'profile' && (
          <div>
            {[
              ['Nationality', d.nationality || '—'],
              ['Emirates ID', d.emiratesId || '—'],
              ['Phone (UAE)', d.phoneUae || d.phone || '—'],
              ['Join date', d.joinDate || '—'],
              ['Visa expiry', d.visaExpiry || '—'],
              ['Client', driverClient || '—'],
              ['Supplier', driverSupplier || '—'],
              ['Pay structure', d.payStructure || 'Monthly fixed'],
              ['Base salary', `AED ${(d.baseSalary || 0).toLocaleString()}`],
              ['Vehicle plate', d.vehiclePlate || d.vehicle || '—'],
            ].map(([l, v]) => (
              <div
                key={l}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '9px 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 13,
                }}
              >
                <span style={{ color: 'var(--text3)' }}>{l}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'financial' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Gross salary</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#4ade80' }}>AED {grossSalary.toLocaleString()}</div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Deductions</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#f87171' }}>AED {deductionsAmt.toLocaleString()}</div>
              </div>
              {advanceBalance > 0 && (
                <div
                  style={{
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.2)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    gridColumn: '1/-1',
                  }}
                >
                  <div style={{ fontSize: 10, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Advance outstanding</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#fbbf24' }}>AED {advanceBalance.toLocaleString()}</div>
                </div>
              )}
            </div>
            <SectionHeader title="Ledger — recent entries" />
            {ledgerLoading ? (
              <LoadingSpinner />
            ) : (
              ledger.map((e, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '9px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text)', marginBottom: 2 }}>{e.description}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{e.ref}</div>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 12,
                      color: e.type === 'debit' || e.amount < 0 ? '#f87171' : '#4ade80',
                      fontWeight: 500,
                    }}
                  >
                    {e.amount < 0 ? '−' : '+'} AED {Math.abs(e.amount).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'documents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {documents.map((doc) => (
              <div
                key={doc.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: 'var(--surface2)',
                  borderRadius: 10,
                  border: doc.status === 'warning' ? '1px solid rgba(245,158,11,0.2)' : '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, marginBottom: 2 }}>{doc.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Expires {doc.expiry}</div>
                </div>
                <Badge variant={doc.status}>{doc.status === 'warning' ? 'Expiring soon' : 'Valid'}</Badge>
              </div>
            ))}
          </div>
        )}

        {tab === 'history' && (
          <div>
            {history.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 80, fontSize: 10, color: 'var(--text3)', paddingTop: 2, flexShrink: 0 }}>{h.date}</div>
                <div>
                  <div style={{ fontSize: 13, marginBottom: 3 }}>{h.event}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{h.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <Btn variant="ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowEdit(true)}>Edit profile</Btn>
        <Btn variant="ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowStatusChange(true)}>Change status</Btn>
      </div>

      {showEdit && (
        <EditDriverModal
          driver={d}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['drivers'] });
            setShowEdit(false);
            onClose();
          }}
        />
      )}

      {showStatusChange && (
        <ChangeStatusModal
          driver={d}
          onClose={() => setShowStatusChange(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['drivers'] });
            setShowStatusChange(false);
            onClose();
          }}
        />
      )}
    </SidePanel>
  );
};

const EditDriverModal = ({ driver, onClose, onSaved }) => {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      fullName: driver.fullName || driver.name || '',
      nationality: driver.nationality || '',
      phoneUae: driver.phoneUae || driver.phone || '',
      baseSalary: driver.baseSalary || '',
      payStructure: driver.payStructure || '',
      emiratesId: driver.emiratesId || '',
      clientId: driver.clientId?._id || driver.clientId || '',
    },
  });
  const [submitting, setSubmitting] = useState(false);

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients(),
  });
  const clients = clientsData?.data || [];

  const onSubmit = async (formData) => {
    setSubmitting(true);
    try {
      await updateDriver(driver._id || driver.id, {
        fullName: formData.fullName,
        nationality: formData.nationality,
        phoneUae: formData.phoneUae,
        baseSalary: Number(formData.baseSalary),
        payStructure: formData.payStructure,
        clientId: formData.clientId,
        emiratesId: formData.emiratesId || undefined,
      });
      toast.success('Driver updated successfully');
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update driver');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldStyle = { marginBottom: 14 };
  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };
  const errorStyle = { color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' };

  return (
    <Modal title="Edit driver" onClose={onClose} width={520}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Full name *</label>
            <input
              {...register('fullName', {
                required: 'Full name is required',
                minLength: { value: 2, message: 'Must be at least 2 characters' },
              })}
            />
            {errors.fullName && <span style={errorStyle}>{errors.fullName.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Nationality *</label>
            <input {...register('nationality', { required: 'Nationality is required' })} />
            {errors.nationality && <span style={errorStyle}>{errors.nationality.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>UAE Phone *</label>
            <input
              {...register('phoneUae', {
                required: 'UAE phone number is required',
                pattern: { value: /^\+971\d{9}$/, message: 'Must match format +971XXXXXXXXX' },
              })}
            />
            {errors.phoneUae && <span style={errorStyle}>{errors.phoneUae.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Pay structure *</label>
            <select {...register('payStructure', { required: 'Pay structure is required' })}>
              <option value="">Select pay structure</option>
              <option value="MONTHLY_FIXED">Monthly fixed</option>
              <option value="DAILY_RATE">Daily rate</option>
              <option value="PER_TRIP">Per trip</option>
            </select>
            {errors.payStructure && <span style={errorStyle}>{errors.payStructure.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Base salary *</label>
            <input
              type="number"
              {...register('baseSalary', {
                required: 'Base salary is required',
                min: { value: 1, message: 'Must be a positive number' },
              })}
            />
            {errors.baseSalary && <span style={errorStyle}>{errors.baseSalary.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Client *</label>
            <select {...register('clientId', { required: 'Client is required' })}>
              <option value="">Select client</option>
              {clients.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
            {errors.clientId && <span style={errorStyle}>{errors.clientId.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Emirates ID</label>
            <input
              {...register('emiratesId', {
                pattern: { value: /^784-\d{4}-\d{7}-\d{1}$/, message: 'Must match format 784-XXXX-XXXXXXX-X' },
              })}
              placeholder="784-XXXX-XXXXXXX-X"
            />
            {errors.emiratesId && <span style={errorStyle}>{errors.emiratesId.message}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save changes'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending_kyc', label: 'Pending KYC' },
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'resigned', label: 'Resigned' },
  { value: 'offboarding', label: 'Offboarding' },
];

const ChangeStatusModal = ({ driver, onClose, onSaved }) => {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { status: driver.status || 'draft', reason: '' },
  });
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (formData) => {
    setSubmitting(true);
    try {
      await changeDriverStatus(driver._id || driver.id, {
        status: formData.status,
        reason: formData.reason || undefined,
      });
      toast.success('Status updated successfully');
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update status');
    } finally {
      setSubmitting(false);
    }
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };
  const errorStyle = { color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' };

  return (
    <Modal title="Change driver status" onClose={onClose} width={400}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Current status</label>
          <StatusBadge status={driver.status || 'draft'} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>New status *</label>
          <select {...register('status', { required: 'Status is required' })}>
            {statusOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {errors.status && <span style={errorStyle}>{errors.status.message}</span>}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Reason</label>
          <textarea
            {...register('reason', { maxLength: { value: 500, message: 'Must be under 500 characters' } })}
            rows={3}
            placeholder="Optional reason for status change..."
            style={{ width: '100%', resize: 'vertical' }}
          />
          {errors.reason && <span style={errorStyle}>{errors.reason.message}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={submitting}>
            {submitting ? 'Updating...' : 'Update status'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default DriverDetail;
