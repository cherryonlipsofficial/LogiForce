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
import { useAuth } from '../../context/AuthContext';
import PermissionGate from '../../components/ui/PermissionGate';
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../../api/suppliersApi';
import Pagination from '../../components/ui/Pagination';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const fallbackSuppliers = [
  { _id: 'SUP-001', name: 'Belhasa', contactName: 'Rashed Al Maktoum', contactEmail: 'rashed@belhasa.ae', contactPhone: '+971 4 567 8901', status: 'active', vehicleCount: 180, driverCount: 165, serviceType: 'Full fleet', monthlyRate: 'AED 1,200/vehicle', contractEnd: '2027-06-30' },
  { _id: 'SUP-002', name: 'EasyLease', contactName: 'Maria Santos', contactEmail: 'maria@easylease.ae', contactPhone: '+971 4 678 9012', status: 'active', vehicleCount: 120, driverCount: 108, serviceType: 'Lease only', monthlyRate: 'AED 950/vehicle', contractEnd: '2026-12-31' },
  { _id: 'SUP-003', name: 'LeasePlan', contactName: 'David Chen', contactEmail: 'david@leaseplan.ae', contactPhone: '+971 4 789 0123', status: 'active', vehicleCount: 85, driverCount: 72, serviceType: 'Lease + maintenance', monthlyRate: 'AED 1,400/vehicle', contractEnd: '2027-03-31' },
  { _id: 'SUP-004', name: 'Own vehicle', contactName: '—', contactEmail: '—', contactPhone: '—', status: 'active', vehicleCount: 371, driverCount: 371, serviceType: 'Driver-owned', monthlyRate: '—', contractEnd: '—' },
];

const isSupplierActive = (s) => s.isActive !== undefined ? s.isActive : s.status === 'active';

// Legacy canEdit removed — using PermissionGate / hasPermission instead

const Suppliers = () => {
  const { isMobile, isTablet } = useBreakpoint();
  const [search, setSearch] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [page, setPage] = useState(1);
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', { search, page }],
    queryFn: () => getSuppliers({ search: search || undefined, page, limit: 20 }),
    retry: 1,
  });

  const { mutate: doDelete } = useMutation({
    mutationFn: (id) => deleteSupplier(id),
    onSuccess: () => {
      toast.success('Supplier deleted');
      qc.invalidateQueries(['suppliers']);
      setSelectedSupplierId(null);
    },
    onError: () => toast.error('Failed to delete supplier'),
  });

  const suppliers = data?.data || fallbackSuppliers;
  const pagination = data?.pagination;
  const filtered = suppliers;

  const totalVehicles = suppliers.reduce((s, sp) => s + (sp.vehicleCount || 0), 0);
  const totalDrivers = suppliers.reduce((s, sp) => s + (sp.driverCount || 0), 0);

  const selectedSupplier = selectedSupplierId ? suppliers.find((s) => s._id === selectedSupplierId) || null : null;
  const editingSupplier = editingSupplierId ? suppliers.find((s) => s._id === editingSupplierId) || null : null;

  const handleEdit = (supplier) => {
    setSelectedSupplierId(null);
    setEditingSupplierId(supplier._id);
  };

  const handleDelete = (supplier) => {
    if (window.confirm(`Are you sure you want to delete "${supplier.name}"? This action cannot be undone.`)) {
      doDelete(supplier._id);
    }
  };

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total suppliers" value={suppliers.length} />
        <KpiCard label="Active" value={suppliers.filter((s) => isSupplierActive(s)).length} color="#4ade80" />
        <KpiCard label="Total vehicles" value={totalVehicles.toLocaleString()} />
        <KpiCard label="Total drivers" value={totalDrivers.toLocaleString()} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)', flexDirection: isMobile ? 'column' : 'row' }}>
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search suppliers..." style={{ width: 260, height: 34 }} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <PermissionGate permission="suppliers.create">
              <Btn small variant="primary" onClick={() => setShowAddModal(true)}>+ Add supplier</Btn>
            </PermissionGate>
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
                    onClick={() => setSelectedSupplierId(s._id)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</div>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontSize: 12 }}>{s.contactName}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{s.contactEmail}</div>
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
                      <Badge variant={isSupplierActive(s) ? 'success' : 'default'}>{isSupplierActive(s) ? 'Active' : 'Inactive'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={pagination?.pages || 1}
          total={pagination?.total ?? suppliers.length}
          pageSize={pagination?.limit || 20}
          onPageChange={setPage}
        />
      </div>

      {selectedSupplier && <SupplierDetail supplier={selectedSupplier} onClose={() => setSelectedSupplierId(null)} onEdit={handleEdit} onDelete={handleDelete} hasPermission={hasPermission} />}
      {showAddModal && <SupplierFormModal onClose={() => setShowAddModal(false)} />}
      {editingSupplier && <SupplierFormModal supplier={editingSupplier} onClose={() => setEditingSupplierId(null)} />}
    </div>
  );
};

const SupplierDetail = ({ supplier, onClose, onEdit, onDelete, hasPermission }) => {
  const { isMobile } = useBreakpoint();
  const active = isSupplierActive(supplier);
  return (
    <SidePanel onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{supplier.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            <Badge variant={active ? 'success' : 'default'}>{active ? 'Active' : 'Inactive'}</Badge>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasPermission('suppliers.edit') && <Btn small variant="ghost" onClick={() => onEdit(supplier)}>Edit</Btn>}
          {hasPermission('suppliers.delete') && <Btn small variant="ghost" onClick={() => onDelete(supplier)} style={{ color: '#f87171' }}>Delete</Btn>}
          <button onClick={onClose} style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 16 }}>&times;</button>
        </div>
      </div>
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <InfoRow label="Contact person" value={supplier.contactName} />
          <InfoRow label="Email" value={supplier.contactEmail} />
          <InfoRow label="Phone" value={supplier.contactPhone} />
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
    <div style={{ fontSize: 13 }}>{value || '—'}</div>
  </div>
);

const SupplierFormModal = ({ supplier, onClose }) => {
  const { isMobile } = useBreakpoint();
  const isEdit = !!supplier;
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: isEdit ? {
      name: supplier.name || '',
      contactName: supplier.contactName || '',
      contactEmail: supplier.contactEmail || '',
      contactPhone: supplier.contactPhone || '',
      serviceType: supplier.serviceType || 'Lease only',
      monthlyRate: supplier.monthlyRate || '',
      vehicleCount: supplier.vehicleCount || '',
      driverCount: supplier.driverCount || '',
      contractEnd: supplier.contractEnd || '',
      isActive: isSupplierActive(supplier) ? 'true' : 'false',
    } : {
      serviceType: 'Lease only',
      isActive: 'true',
    },
  });
  const qc = useQueryClient();

  const { mutate: save, isLoading } = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        vehicleCount: data.vehicleCount ? Number(data.vehicleCount) : 0,
        driverCount: data.driverCount ? Number(data.driverCount) : 0,
        isActive: data.isActive === true || data.isActive === 'true',
      };
      return isEdit ? updateSupplier(supplier._id, payload) : createSupplier(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Supplier updated' : 'Supplier created');
      qc.invalidateQueries(['suppliers']);
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.message || (isEdit ? 'Failed to update supplier' : 'Failed to create supplier')),
  });

  const fieldStyle = { marginBottom: 14 };
  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title={isEdit ? 'Edit supplier' : 'Add new supplier'} onClose={onClose} width={520}>
      <form onSubmit={handleSubmit((data) => save(data))}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Company name *</label>
            <input {...register('name', { required: true })} placeholder="Fleet Partner LLC" />
            {errors.name && <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Contact person</label>
            <input {...register('contactName')} placeholder="John Doe" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Email</label>
            <input type="email" {...register('contactEmail')} placeholder="contact@company.com" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Phone</label>
            <input {...register('contactPhone')} placeholder="+971 4 123 4567" />
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
          <div style={fieldStyle}>
            <label style={labelStyle}>Vehicles</label>
            <input type="number" {...register('vehicleCount')} placeholder="0" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Drivers</label>
            <input type="number" {...register('driverCount')} placeholder="0" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Contract end</label>
            <input type="date" {...register('contractEnd')} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Status</label>
            <select {...register('isActive')}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isLoading}>{isLoading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save changes' : 'Create supplier')}</Btn>
        </div>
      </form>
    </Modal>
  );
};

export default Suppliers;
