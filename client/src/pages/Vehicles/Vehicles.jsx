import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import SidePanel from '../../components/ui/SidePanel';
import { getVehicles, createVehicle, updateVehicle, deleteVehicle } from '../../api/vehiclesApi';
import { getSuppliers } from '../../api/suppliersApi';

const fallbackVehicles = [
  { _id: 'V001', plate: 'DXB A 12345', make: 'Toyota', model: 'Hiace', year: 2024, vehicleType: 'Van', status: 'assigned', monthlyRate: 1200, supplierId: { name: 'Belhasa' }, assignedDriverId: { fullName: 'Ali Hassan', employeeCode: 'DRV-00012' }, contractEnd: '2027-06-30' },
  { _id: 'V002', plate: 'DXB B 67890', make: 'Nissan', model: 'Urvan', year: 2023, vehicleType: 'Van', status: 'assigned', monthlyRate: 950, supplierId: { name: 'EasyLease' }, assignedDriverId: { fullName: 'Raj Kumar', employeeCode: 'DRV-00045' }, contractEnd: '2026-12-31' },
  { _id: 'V003', plate: 'AUH C 11223', make: 'Toyota', model: 'Hilux', year: 2024, vehicleType: 'Pickup', status: 'available', monthlyRate: 1400, supplierId: { name: 'LeasePlan' }, assignedDriverId: null, contractEnd: '2027-03-31' },
  { _id: 'V004', plate: 'SHJ D 44556', make: 'Mitsubishi', model: 'L300', year: 2022, vehicleType: 'Van', status: 'maintenance', monthlyRate: 1100, supplierId: { name: 'Belhasa' }, assignedDriverId: null, contractEnd: '2026-09-30' },
  { _id: 'V005', plate: 'DXB E 78901', make: 'Hyundai', model: 'H1', year: 2023, vehicleType: 'Van', status: 'off_hired', monthlyRate: 0, supplierId: { name: 'EasyLease' }, assignedDriverId: null, contractEnd: '2026-03-15', offHireReason: 'Accident write-off' },
  { _id: 'V006', plate: 'DXB F 33221', make: 'Toyota', model: 'Hiace', year: 2024, vehicleType: 'Van', status: 'assigned', monthlyRate: 1200, supplierId: { name: 'Belhasa' }, assignedDriverId: { fullName: 'James Okafor', employeeCode: 'DRV-00078' }, contractEnd: '2027-06-30' },
  { _id: 'V007', plate: 'DXB G 99887', make: 'Kia', model: 'K2700', year: 2023, vehicleType: 'Truck', status: 'available', monthlyRate: 1500, supplierId: { name: 'LeasePlan' }, assignedDriverId: null, contractEnd: '2027-01-15' },
  { _id: 'V008', plate: 'AJM H 55443', make: 'Nissan', model: 'NV350', year: 2024, vehicleType: 'Van', status: 'assigned', monthlyRate: 1050, supplierId: { name: 'EasyLease' }, assignedDriverId: { fullName: 'Ahmed Ali', employeeCode: 'DRV-00102' }, contractEnd: '2026-11-30' },
];

const statusMap = {
  available: { label: 'Available', variant: 'success' },
  assigned: { label: 'Assigned', variant: 'info' },
  maintenance: { label: 'Maintenance', variant: 'warning' },
  off_hired: { label: 'Off-hired', variant: 'danger' },
  reserved: { label: 'Reserved', variant: 'default' },
};

const Vehicles = () => {
  const [searchParams] = useSearchParams();
  const initialPlate = searchParams.get('plate') || '';
  const [search, setSearch] = useState(initialPlate);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => getVehicles({ limit: 500 }),
    retry: 1,
  });

  const { mutate: doDelete } = useMutation({
    mutationFn: (id) => deleteVehicle(id),
    onSuccess: () => {
      toast.success('Vehicle deleted');
      qc.invalidateQueries(['vehicles']);
      setSelectedVehicleId(null);
    },
    onError: () => toast.error('Failed to delete vehicle'),
  });

  const vehicles = data?.data || fallbackVehicles;

  const filtered = vehicles.filter((v) => {
    const matchSearch =
      !search ||
      v.plate?.toLowerCase().includes(search.toLowerCase()) ||
      v.make?.toLowerCase().includes(search.toLowerCase()) ||
      v.model?.toLowerCase().includes(search.toLowerCase()) ||
      v.assignedDriverId?.fullName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || v.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalVehicles = vehicles.length;
  const assignedCount = vehicles.filter((v) => v.status === 'assigned').length;
  const availableCount = vehicles.filter((v) => v.status === 'available').length;
  const maintenanceCount = vehicles.filter((v) => v.status === 'maintenance').length;

  const selectedVehicle = selectedVehicleId ? vehicles.find((v) => v._id === selectedVehicleId) : null;
  const editingVehicle = editingVehicleId ? vehicles.find((v) => v._id === editingVehicleId) : null;

  const handleEdit = (vehicle) => {
    setSelectedVehicleId(null);
    setEditingVehicleId(vehicle._id);
  };

  const handleDelete = (vehicle) => {
    if (window.confirm(`Delete vehicle "${vehicle.plate}"? This cannot be undone.`)) {
      doDelete(vehicle._id);
    }
  };

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total vehicles" value={totalVehicles} />
        <KpiCard label="Assigned" value={assignedCount} color="#4f8ef7" />
        <KpiCard label="Available" value={availableCount} color="#4ade80" />
        <KpiCard label="Maintenance" value={maintenanceCount} color="#fbbf24" />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plate, make, model, driver..."
            style={{ width: 280, height: 34 }}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 160, height: 34 }}>
            <option value="all">All statuses</option>
            <option value="assigned">Assigned</option>
            <option value="available">Available</option>
            <option value="maintenance">Maintenance</option>
            <option value="off_hired">Off-hired</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Btn small variant="primary" onClick={() => setShowAddModal(true)}>+ Add vehicle</Btn>
          </div>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No vehicles found" message="Add a vehicle or adjust your filters." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {['Plate', 'Vehicle', 'Type', 'Supplier', 'Assigned driver', 'Rate/mo', 'Contract end', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', background: 'var(--surface2)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const st = statusMap[v.status] || statusMap.available;
                  return (
                    <tr
                      key={v._id}
                      onClick={() => setSelectedVehicleId(v._id)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500 }}>{v.plate}</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontSize: 12 }}>{v.make} {v.model}</div>
                        {v.year && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{v.year}</div>}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)' }}>{v.vehicleType}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{v.supplierId?.name || '—'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        {v.assignedDriverId ? (
                          <div>
                            <div style={{ fontSize: 12 }}>{v.assignedDriverId.fullName}</div>
                            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{v.assignedDriverId.employeeCode}</div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                          {v.monthlyRate ? `AED ${v.monthlyRate.toLocaleString()}` : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)' }}>
                        {v.contractEnd ? new Date(v.contractEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
          Showing {filtered.length} of {vehicles.length} vehicles
        </div>
      </div>

      {selectedVehicle && (
        <VehicleDetail
          vehicle={selectedVehicle}
          onClose={() => setSelectedVehicleId(null)}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
      {showAddModal && <VehicleFormModal onClose={() => setShowAddModal(false)} />}
      {editingVehicle && <VehicleFormModal vehicle={editingVehicle} onClose={() => setEditingVehicleId(null)} />}
    </div>
  );
};

const VehicleDetail = ({ vehicle, onClose, onEdit, onDelete }) => {
  const st = statusMap[vehicle.status] || statusMap.available;
  return (
    <SidePanel onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 600 }}>{vehicle.plate}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Btn small variant="ghost" onClick={() => onEdit(vehicle)}>Edit</Btn>
          <Btn small variant="ghost" onClick={() => onDelete(vehicle)} style={{ color: '#f87171' }}>Delete</Btn>
          <button onClick={onClose} style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 16 }}>&times;</button>
        </div>
      </div>
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <InfoRow label="Status" value={<Badge variant={st.variant}>{st.label}</Badge>} />
          <InfoRow label="Vehicle type" value={vehicle.vehicleType} />
          <InfoRow label="Supplier" value={vehicle.supplierId?.name} />
          <InfoRow label="Monthly rate" value={vehicle.monthlyRate ? `AED ${vehicle.monthlyRate.toLocaleString()}` : '—'} />
          <InfoRow label="Assigned driver" value={vehicle.assignedDriverId?.fullName || 'Unassigned'} />
          <InfoRow label="Driver code" value={vehicle.assignedDriverId?.employeeCode || '—'} />
          <InfoRow label="Contract start" value={vehicle.contractStart ? new Date(vehicle.contractStart).toLocaleDateString('en-GB') : '—'} />
          <InfoRow label="Contract end" value={vehicle.contractEnd ? new Date(vehicle.contractEnd).toLocaleDateString('en-GB') : '—'} />
          <InfoRow label="Mulkiya expiry" value={vehicle.mulkiyaExpiry ? new Date(vehicle.mulkiyaExpiry).toLocaleDateString('en-GB') : '—'} />
          <InfoRow label="Insurance expiry" value={vehicle.insuranceExpiry ? new Date(vehicle.insuranceExpiry).toLocaleDateString('en-GB') : '—'} />
          <InfoRow label="Color" value={vehicle.color || '—'} />
          <InfoRow label="Own vehicle" value={vehicle.ownVehicle ? 'Yes' : 'No'} />
        </div>
        {vehicle.offHireReason && (
          <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#f87171', fontWeight: 500, marginBottom: 4 }}>Off-hire reason</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>{vehicle.offHireReason}</div>
          </div>
        )}
        {vehicle.notes && (
          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>{vehicle.notes}</div>
          </div>
        )}
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

const VehicleFormModal = ({ vehicle, onClose }) => {
  const isEdit = !!vehicle;
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: isEdit
      ? {
          plate: vehicle.plate || '',
          make: vehicle.make || '',
          model: vehicle.model || '',
          year: vehicle.year || '',
          color: vehicle.color || '',
          vehicleType: vehicle.vehicleType || 'Sedan',
          status: vehicle.status || 'available',
          monthlyRate: vehicle.monthlyRate || '',
          supplierId: vehicle.supplierId?._id || vehicle.supplierId || '',
          contractStart: vehicle.contractStart ? vehicle.contractStart.slice(0, 10) : '',
          contractEnd: vehicle.contractEnd ? vehicle.contractEnd.slice(0, 10) : '',
          mulkiyaExpiry: vehicle.mulkiyaExpiry ? vehicle.mulkiyaExpiry.slice(0, 10) : '',
          insuranceExpiry: vehicle.insuranceExpiry ? vehicle.insuranceExpiry.slice(0, 10) : '',
          ownVehicle: vehicle.ownVehicle ? 'true' : 'false',
          notes: vehicle.notes || '',
        }
      : { vehicleType: 'Van', status: 'available', ownVehicle: 'false' },
  });
  const qc = useQueryClient();

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => getSuppliers(),
  });
  const suppliers = suppliersData?.data || [];

  const { mutate: save, isLoading } = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        year: data.year ? Number(data.year) : undefined,
        monthlyRate: data.monthlyRate ? Number(data.monthlyRate) : 0,
        supplierId: data.supplierId || undefined,
        ownVehicle: data.ownVehicle === true || data.ownVehicle === 'true',
        contractStart: data.contractStart || undefined,
        contractEnd: data.contractEnd || undefined,
        mulkiyaExpiry: data.mulkiyaExpiry || undefined,
        insuranceExpiry: data.insuranceExpiry || undefined,
      };
      return isEdit ? updateVehicle(vehicle._id, payload) : createVehicle(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Vehicle updated' : 'Vehicle added');
      qc.invalidateQueries(['vehicles']);
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to save vehicle'),
  });

  const fieldStyle = { marginBottom: 14 };
  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title={isEdit ? 'Edit vehicle' : 'Add new vehicle'} onClose={onClose} width={560}>
      <form onSubmit={handleSubmit((data) => save(data))}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Plate number *</label>
            <input {...register('plate', { required: true })} placeholder="DXB A 12345" />
            {errors.plate && <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Vehicle type</label>
            <select {...register('vehicleType')}>
              {['Sedan', 'SUV', 'Van', 'Pickup', 'Motorcycle', 'Truck', 'Other'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Make</label>
            <input {...register('make')} placeholder="Toyota" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Model</label>
            <input {...register('model')} placeholder="Hiace" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Year</label>
            <input type="number" {...register('year')} placeholder="2024" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Color</label>
            <input {...register('color')} placeholder="White" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Supplier</label>
            <select {...register('supplierId')}>
              <option value="">No supplier</option>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Monthly rate (AED)</label>
            <input type="number" {...register('monthlyRate')} placeholder="1200" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Status</label>
            <select {...register('status')}>
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="maintenance">Maintenance</option>
              <option value="off_hired">Off-hired</option>
              <option value="reserved">Reserved</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Own vehicle</label>
            <select {...register('ownVehicle')}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Contract start</label>
            <input type="date" {...register('contractStart')} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Contract end</label>
            <input type="date" {...register('contractEnd')} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Mulkiya expiry</label>
            <input type="date" {...register('mulkiyaExpiry')} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Insurance expiry</label>
            <input type="date" {...register('insuranceExpiry')} />
          </div>
          <div style={{ ...fieldStyle, gridColumn: '1/-1' }}>
            <label style={labelStyle}>Notes</label>
            <textarea {...register('notes')} rows={2} placeholder="Optional notes..." style={{ width: '100%', resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isLoading}>
            {isLoading ? (isEdit ? 'Saving...' : 'Adding...') : (isEdit ? 'Save changes' : 'Add vehicle')}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default Vehicles;
