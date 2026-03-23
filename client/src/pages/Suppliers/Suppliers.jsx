import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import SidePanel from '../../components/ui/SidePanel';
import { getSuppliers, createSupplier } from '../../api/suppliersApi';

const fallbackSuppliers = [
  { _id: 'SUP-001', name: 'Belhasa', contactPerson: 'Rashed Al Maktoum', email: 'rashed@belhasa.ae', phone: '+971 4 567 8901', status: 'active', vehicleCount: 180, driverCount: 165, serviceType: 'Full fleet', monthlyRate: 'AED 1,200/vehicle', contractEnd: '2027-06-30' },
  { _id: 'SUP-002', name: 'EasyLease', contactPerson: 'Maria Santos', email: 'maria@easylease.ae', phone: '+971 4 678 9012', status: 'active', vehicleCount: 120, driverCount: 108, serviceType: 'Lease only', monthlyRate: 'AED 950/vehicle', contractEnd: '2026-12-31' },
  { _id: 'SUP-003', name: 'LeasePlan', contactPerson: 'David Chen', email: 'david@leaseplan.ae', phone: '+971 4 789 0123', status: 'active', vehicleCount: 85, driverCount: 72, serviceType: 'Lease + maintenance', monthlyRate: 'AED 1,400/vehicle', contractEnd: '2027-03-31' },
  { _id: 'SUP-004', name: 'Own vehicle', contactPerson: '—', email: '—', phone: '—', status: 'active', vehicleCount: 371, driverCount: 371, serviceType: 'Driver-owned', monthlyRate: '—', contractEnd: '—' },
];

const Suppliers = () => {
  const [search, setSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => getSuppliers(),
    retry: 1,
  });

  const suppliers = data?.data || fallbackSuppliers;
  const filtered = suppliers.filter((s) => s.name?.toLowerCase().includes(search.toLowerCase()));

  const totalVehicles = suppliers.reduce((s, sp) => s + (sp.vehicleCount || 0), 0);
  const totalDrivers = suppliers.reduce((s, sp) => s + (sp.driverCount || 0), 0);

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total suppliers" value={suppliers.length} />
        <KpiCard label="Active" value={suppliers.filter((s) => s.status === 'active').length} color="#4ade80" />
        <KpiCard label="Total vehicles" value={totalVehicles.toLocaleString()} />
        <KpiCard label="Total drivers" value={totalDrivers.toLocaleString()} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search suppliers..." style={{ width: 260, height: 34 }} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Btn small variant="primary" onClick={() => setShowAddModal(true)}>+ Add supplier</Btn>
          </div>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No suppliers found" message="Add a supplier to get started." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {['Supplier', 'Contact', 'Service type', 'Vehicles', 'Drivers', 'Monthly rate', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', background: 'var(--surface2)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s._id}
                    onClick={() => setSelectedSupplier(s)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</div>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontSize: 12 }}>{s.contactPerson}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{s.email}</div>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)' }}>{s.serviceType}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{s.vehicleCount}</span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{s.driverCount}</span>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)' }}>{s.monthlyRate}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <Badge variant={s.status === 'active' ? 'success' : 'default'}>{s.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
          Showing {filtered.length} of {suppliers.length} suppliers
        </div>
      </div>

      {selectedSupplier && <SupplierDetail supplier={selectedSupplier} onClose={() => setSelectedSupplier(null)} />}
      {showAddModal && <AddSupplierModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
};

const SupplierDetail = ({ supplier, onClose }) => {
  return (
    <SidePanel onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{supplier.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            <Badge variant={supplier.status === 'active' ? 'success' : 'default'}>{supplier.status === 'active' ? 'Active' : 'Inactive'}</Badge>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 16 }}>&times;</button>
      </div>
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <InfoRow label="Contact person" value={supplier.contactPerson} />
          <InfoRow label="Email" value={supplier.email} />
          <InfoRow label="Phone" value={supplier.phone} />
          <InfoRow label="Service type" value={supplier.serviceType} />
          <InfoRow label="Vehicles" value={supplier.vehicleCount} />
          <InfoRow label="Drivers" value={supplier.driverCount} />
          <InfoRow label="Monthly rate" value={supplier.monthlyRate} />
          <InfoRow label="Contract end" value={supplier.contractEnd} />
        </div>
      </div>
    </SidePanel>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div>
  </div>
);

const AddSupplierModal = ({ onClose }) => {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const qc = useQueryClient();

  const { mutate: create, isLoading } = useMutation({
    mutationFn: (data) => createSupplier(data),
    onSuccess: () => {
      toast.success('Supplier created');
      qc.invalidateQueries(['suppliers']);
      onClose();
    },
    onError: () => toast.error('Failed to create supplier'),
  });

  const fieldStyle = { marginBottom: 14 };
  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title="Add new supplier" onClose={onClose} width={520}>
      <form onSubmit={handleSubmit((data) => create(data))}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Company name *</label>
            <input {...register('name', { required: true })} placeholder="Fleet Partner LLC" />
            {errors.name && <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Contact person</label>
            <input {...register('contactPerson')} placeholder="John Doe" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Email</label>
            <input type="email" {...register('email')} placeholder="contact@company.com" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Phone</label>
            <input {...register('phone')} placeholder="+971 4 123 4567" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Service type</label>
            <select {...register('serviceType')}>
              <option value="Lease only">Lease only</option>
              <option value="Full fleet">Full fleet</option>
              <option value="Lease + maintenance">Lease + maintenance</option>
              <option value="Driver-owned">Driver-owned</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Monthly rate</label>
            <input {...register('monthlyRate')} placeholder="AED 1,200/vehicle" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isLoading}>{isLoading ? 'Creating...' : 'Create supplier'}</Btn>
        </div>
      </form>
    </Modal>
  );
};

export default Suppliers;
