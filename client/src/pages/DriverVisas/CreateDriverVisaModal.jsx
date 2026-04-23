import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '../../components/ui/Modal';
import Btn from '../../components/ui/Btn';
import { createDriverVisa } from '../../api/driverVisasApi';
import { getDrivers } from '../../api/driversApi';

const inputStyle = {
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid var(--border2)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 13,
  width: '100%',
};

const CreateDriverVisaModal = ({ onClose, onSuccess }) => {
  const queryClient = useQueryClient();
  const [driver, setDriver] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    visaCategory: 'company_visa',
    visaLabel: '',
    referenceName: '',
    visaNumber: '',
    issueDate: '',
    expiryDate: '',
    totalCost: 0,
    medicalInsuranceCost: 0,
    discountAmount: 0,
    cashPaid: 0,
    monthlyDeduction: 0,
    remarks: '',
  });

  const { data: driverResults } = useQuery({
    queryKey: ['drivers-search-visa', search],
    queryFn: () => getDrivers({ search, limit: 10 }),
    enabled: !driver && search.length >= 2,
    keepPreviousData: true,
  });

  const mut = useMutation({
    mutationFn: () =>
      createDriverVisa({
        driverId: driver._id,
        ...form,
        issueDate: form.issueDate || undefined,
        expiryDate: form.expiryDate || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-visas'] });
      onSuccess?.();
    },
  });

  const set = (k) => (e) =>
    setForm({
      ...form,
      [k]: e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value,
    });

  return (
    <Modal onClose={onClose} title="Add driver visa record" width={620}>
      {!driver ? (
        <>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Select driver</div>
          <input
            autoFocus
            type="text"
            placeholder="Search by name or employee code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />
          <div style={{ marginTop: 10, maxHeight: 280, overflowY: 'auto' }}>
            {search.length < 2 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', padding: '16px 0', textAlign: 'center' }}>
                Type at least 2 characters to search
              </div>
            ) : (
              (driverResults?.data || []).map((d) => (
                <div
                  key={d._id}
                  onClick={() => setDriver(d)}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    marginBottom: 6,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{d.fullName || d.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {d.employeeCode || '—'} · {d.visaType || 'no visa'} · {d.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              padding: 10,
              border: '1px solid var(--border)',
              borderRadius: 8,
              marginBottom: 14,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 500 }}>{driver.fullName || driver.name}</div>
              <div style={{ color: 'var(--text3)', fontSize: 11 }}>{driver.employeeCode || '—'}</div>
            </div>
            <Btn small variant="ghost" onClick={() => setDriver(null)}>Change</Btn>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <label style={labelStyle}>
              Visa category
              <select value={form.visaCategory} onChange={set('visaCategory')} style={inputStyle}>
                <option value="company_visa">Company Visa</option>
                <option value="twp">TWP (Temporary Work Permit)</option>
              </select>
            </label>
            <label style={labelStyle}>
              Visa label (header)
              <input type="text" value={form.visaLabel} onChange={set('visaLabel')} style={inputStyle} placeholder="e.g. HM Visa" />
            </label>
            <label style={labelStyle}>
              Reference name
              <input type="text" value={form.referenceName} onChange={set('referenceName')} style={inputStyle} placeholder="Referrer's name" />
            </label>
            <label style={labelStyle}>
              Visa number
              <input type="text" value={form.visaNumber} onChange={set('visaNumber')} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Issue date
              <input type="date" value={form.issueDate} onChange={set('issueDate')} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Expiry date
              <input type="date" value={form.expiryDate} onChange={set('expiryDate')} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Total charges (AED)
              <input type="number" min="0" step="0.01" value={form.totalCost} onChange={set('totalCost')} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Medical insurance (AED)
              <input type="number" min="0" step="0.01" value={form.medicalInsuranceCost} onChange={set('medicalInsuranceCost')} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Discount / waive-off (AED)
              <input type="number" min="0" step="0.01" value={form.discountAmount} onChange={set('discountAmount')} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Cash received upfront (AED)
              <input type="number" min="0" step="0.01" value={form.cashPaid} onChange={set('cashPaid')} style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              Agreed monthly deduction (AED)
              <input type="number" min="0" step="0.01" value={form.monthlyDeduction} onChange={set('monthlyDeduction')} style={inputStyle} />
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                Set 0 to not auto-deduct from salary. Finance/Accounts can change later.
              </span>
            </label>
            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              Remarks
              <textarea
                value={form.remarks}
                onChange={set('remarks')}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </label>
          </div>

          {mut.isError && (
            <div style={{ color: '#f87171', fontSize: 12, marginTop: 10 }}>
              {mut.error?.response?.data?.message || mut.error?.message}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" disabled={mut.isLoading} onClick={() => mut.mutate()}>
              {mut.isLoading ? 'Saving…' : 'Create record'}
            </Btn>
          </div>
        </>
      )}
    </Modal>
  );
};

const labelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 11,
  color: 'var(--text3)',
};

export default CreateDriverVisaModal;
