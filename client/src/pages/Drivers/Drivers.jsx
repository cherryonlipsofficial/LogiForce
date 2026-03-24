import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import KpiCard from '../../components/ui/KpiCard';
import Avatar from '../../components/ui/Avatar';
import StatusBadge from '../../components/ui/StatusBadge';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DriverDetail from './DriverDetail';
import { getDrivers, createDriver } from '../../api/driversApi';
import { getClients } from '../../api/clientsApi';

const fallbackDrivers = [
  { id: 'DRV-00814', name: 'Mohamed Al Farsi', nationality: 'Emirati', client: 'Amazon UAE', supplier: 'Own vehicle', status: 'active', baseSalary: 2800, netSalary: 2313, advanceBalance: 500, workingDays: 22, overtimeHrs: 4.5, grossSalary: 2800, deductions: 487, joinDate: '03 Mar 2023', visaExpiry: '15 Apr 2026', emiratesId: '784-1985-1234567-1', phone: '+971 55 123 4567', vehicle: 'AB-12345', payStructure: 'Monthly fixed' },
  { id: 'DRV-00234', name: 'Raj Kumar', nationality: 'Indian', client: 'Amazon UAE', supplier: 'Belhasa', status: 'active', baseSalary: 2200, netSalary: 0, advanceBalance: 1200, workingDays: 0, overtimeHrs: 0, grossSalary: 0, deductions: 225, joinDate: '15 Jun 2022', visaExpiry: '20 Aug 2026', emiratesId: '784-1990-7654321-2', phone: '+971 52 987 6543', vehicle: 'CD-67890', payStructure: 'Monthly fixed' },
  { id: 'DRV-00410', name: 'Carlos Martinez', nationality: 'Filipino', client: 'Noon', supplier: 'EasyLease', status: 'active', baseSalary: 2500, netSalary: 2550, advanceBalance: 0, workingDays: 27, overtimeHrs: 12, grossSalary: 2900, deductions: 350, joinDate: '01 Jan 2023', visaExpiry: '10 Dec 2026', emiratesId: '784-1988-3456789-3', phone: '+971 56 111 2233', vehicle: 'EF-11223', payStructure: 'Monthly fixed' },
  { id: 'DRV-00187', name: 'Suresh Patel', nationality: 'Indian', client: 'Noon', supplier: 'Own vehicle', status: 'active', baseSalary: 2400, netSalary: 2325, advanceBalance: 800, workingDays: 26, overtimeHrs: 8, grossSalary: 2600, deductions: 275, joinDate: '22 Feb 2022', visaExpiry: '05 Mar 2027', emiratesId: '784-1985-9876543-4', phone: '+971 50 444 5566', vehicle: 'GH-33445', payStructure: 'Monthly fixed' },
  { id: 'DRV-00562', name: 'Ahmed Karimi', nationality: 'Pakistani', client: 'Amazon UAE', supplier: 'Belhasa', status: 'on_leave', baseSalary: 2600, netSalary: 2180, advanceBalance: 0, workingDays: 22, overtimeHrs: 0, grossSalary: 2600, deductions: 420, joinDate: '10 Apr 2021', visaExpiry: '25 Nov 2026', emiratesId: '784-1992-1122334-5', phone: '+971 55 777 8899', vehicle: 'IJ-55667', payStructure: 'Monthly fixed' },
  { id: 'DRV-00318', name: 'James Okafor', nationality: 'Nigerian', client: 'Talabat', supplier: 'LeasePlan', status: 'suspended', baseSalary: 2300, netSalary: 1210, advanceBalance: 1800, workingDays: 18, overtimeHrs: 0, grossSalary: 1590, deductions: 380, joinDate: '08 Sep 2023', visaExpiry: '01 Mar 2026', emiratesId: '784-1995-5544332-6', phone: '+971 52 333 4455', vehicle: 'KL-77889', payStructure: 'Monthly fixed' },
  { id: 'DRV-00091', name: 'Ali Hassan', nationality: 'Yemeni', client: 'Amazon UAE', supplier: 'Own vehicle', status: 'active', baseSalary: 2100, netSalary: 0, advanceBalance: 0, workingDays: 0, overtimeHrs: 0, grossSalary: 0, deductions: 75, joinDate: '14 Nov 2022', visaExpiry: '30 Jun 2026', emiratesId: '784-1987-6677889-7', phone: '+971 56 222 3344', vehicle: 'MN-99001', payStructure: 'Monthly fixed' },
  { id: 'DRV-00655', name: 'Priya Sharma', nationality: 'Indian', client: 'Noon', supplier: 'EasyLease', status: 'active', baseSalary: 2700, netSalary: 2490, advanceBalance: 300, workingDays: 24, overtimeHrs: 6, grossSalary: 2800, deductions: 310, joinDate: '05 May 2023', visaExpiry: '12 Sep 2026', emiratesId: '784-1993-2233445-8', phone: '+971 50 666 7788', vehicle: 'OP-12234', payStructure: 'Monthly fixed' },
];

const Drivers = () => {
  const [selected, setSelected] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['drivers', { search, status: statusFilter, clientId: clientFilter }],
    queryFn: () => getDrivers({ search, status: statusFilter !== 'all' ? statusFilter : undefined, clientId: clientFilter !== 'all' ? clientFilter : undefined }),
    retry: 1,
    onError: () => toast.error('Failed to load drivers'),
  });

  const drivers = data?.data || fallbackDrivers;

  const filtered = drivers.filter((d) => {
    const driverName = d.fullName || d.name || '';
    const driverClient = d.clientId?.name || d.client || '';
    const ms = driverName.toLowerCase().includes(search.toLowerCase()) || d.id?.includes(search) || d.employeeCode?.includes(search);
    const mf = statusFilter === 'all' || d.status === statusFilter;
    const mc = clientFilter === 'all' || driverClient === clientFilter;
    return ms && mf && mc;
  });

  const getInitials = (name) =>
    name ? name.split(' ').map((n) => n[0]).join('').toUpperCase() : '??';

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total drivers" value="1,240" />
        <KpiCard label="Active" value="1,180" color="#4ade80" />
        <KpiCard label="On leave" value="42" color="#7eb3fc" />
        <KpiCard label="Suspended" value="18" color="#f87171" />
      </div>

      {/* Table */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or ID..."
            style={{ width: 240, height: 34 }}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 160, height: 34 }}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="on_leave">On leave</option>
            <option value="suspended">Suspended</option>
          </select>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={{ width: 160, height: 34 }}>
            <option value="all">All clients</option>
            <option value="Amazon UAE">Amazon UAE</option>
            <option value="Noon">Noon</option>
            <option value="Talabat">Talabat</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Btn small variant="ghost">Export</Btn>
            <Btn small variant="primary" onClick={() => setShowAddModal(true)}>+ Add driver</Btn>
          </div>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {['Driver', 'ID', 'Client', 'Supplier', 'Status', 'Base salary', 'Mar net pay', 'Advance'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '9px 14px',
                        fontSize: 11,
                        color: 'var(--text3)',
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        textAlign: 'left',
                        background: 'var(--surface2)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr
                    key={d._id || d.id}
                    onClick={() => setSelected(d)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar initials={getInitials(d.fullName || d.name)} size={30} />
                        <div>
                          <div style={{ fontSize: 13 }}>{d.fullName || d.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>{d.nationality}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{d.employeeCode || d.id}</span>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12 }}>{d.clientId?.name || d.client}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)' }}>{d.supplierId?.name || d.supplier}</td>
                    <td style={{ padding: '11px 14px' }}><StatusBadge status={d.status} /></td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>AED {(d.baseSalary || 0).toLocaleString()}</span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: (d.netSalary || 0) > 0 ? '#4ade80' : '#f87171' }}>
                        AED {(d.netSalary || 0).toLocaleString()}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {(d.advanceBalance || 0) > 0 ? (
                        <Badge variant="warning">AED {d.advanceBalance.toLocaleString()}</Badge>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
          Showing {filtered.length} of {drivers.length} drivers
        </div>
      </div>

      {/* Side panel */}
      {selected && <DriverDetail driver={selected} onClose={() => setSelected(null)} />}

      {/* Add modal */}
      {showAddModal && <AddDriverModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
};

const AddDriverModal = ({ onClose }) => {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors }, setError } = useForm();
  const [submitting, setSubmitting] = useState(false);

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients(),
  });
  const clients = clientsData?.data || [];

  const onSubmit = async (formData) => {
    setSubmitting(true);
    try {
      const payload = {
        fullName: formData.fullName,
        nationality: formData.nationality,
        phoneUae: formData.phoneUae,
        baseSalary: Number(formData.baseSalary),
        payStructure: formData.payStructure,
        clientId: formData.clientId,
        emiratesId: formData.emiratesId || undefined,
        joinDate: formData.joinDate || undefined,
      };
      await createDriver(payload);
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      toast.success('Driver created successfully');
      onClose();
    } catch (err) {
      const apiErrors = err?.response?.data?.errors;
      if (apiErrors && Array.isArray(apiErrors)) {
        apiErrors.forEach(({ field, message }) => {
          setError(field, { type: 'server', message });
        });
      } else {
        toast.error(err?.response?.data?.message || 'Failed to create driver');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fieldStyle = { marginBottom: 14 };
  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };
  const errorStyle = { color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' };

  return (
    <Modal title="Add new driver" onClose={onClose} width={520}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Full name *</label>
            <input
              {...register('fullName', {
                required: 'Full name is required',
                minLength: { value: 2, message: 'Must be at least 2 characters' },
                maxLength: { value: 200, message: 'Must be under 200 characters' },
              })}
              placeholder="Mohamed Al Farsi"
            />
            {errors.fullName && <span style={errorStyle}>{errors.fullName.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Nationality *</label>
            <input
              {...register('nationality', { required: 'Nationality is required' })}
              placeholder="Emirati"
            />
            {errors.nationality && <span style={errorStyle}>{errors.nationality.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>UAE Phone *</label>
            <input
              {...register('phoneUae', {
                required: 'UAE phone number is required',
                pattern: {
                  value: /^\+971\d{9}$/,
                  message: 'Must match format +971XXXXXXXXX',
                },
              })}
              placeholder="+971501234567"
            />
            {errors.phoneUae && <span style={errorStyle}>{errors.phoneUae.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Emirates ID</label>
            <input
              {...register('emiratesId', {
                pattern: {
                  value: /^784-\d{4}-\d{7}-\d{1}$/,
                  message: 'Must match format 784-XXXX-XXXXXXX-X',
                },
              })}
              placeholder="784-XXXX-XXXXXXX-X"
            />
            {errors.emiratesId && <span style={errorStyle}>{errors.emiratesId.message}</span>}
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
              step="any"
              {...register('baseSalary', {
                required: 'Base salary is required',
                min: { value: 0.01, message: 'Must be a positive number' },
              })}
              placeholder="2800"
            />
            {errors.baseSalary && <span style={errorStyle}>{errors.baseSalary.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Joining date</label>
            <input type="date" {...register('joinDate')} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create driver'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default Drivers;
