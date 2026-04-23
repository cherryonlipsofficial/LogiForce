import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import { createVehicle } from '../../api/vehiclesApi';
import { getSuppliers } from '../../api/suppliersApi';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const labelStyle = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text2)',
  marginBottom: 4,
  display: 'block',
};

const fieldStyle = { marginBottom: 14 };

const sectionTitle = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
  marginBottom: 4,
  marginTop: 20,
};

const AddFleetVehicleModal = ({ onClose, onSuccess }) => {
  const { isMobile, isTablet } = useBreakpoint();
  const qc = useQueryClient();

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => getSuppliers().then((r) => r.data),
    staleTime: 120_000,
  });
  const suppliers = Array.isArray(suppliersData) ? suppliersData : [];

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      plate: '',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      color: '',
      vehicleType: 'Sedan',
      supplierId: '',
      monthlyRate: '',
      contractStart: '',
      contractEnd: '',
      contractNumber: '',
      depositAmount: 0,
      chassisNumber: '',
      engineNumber: '',
      registrationExpiry: '',
      insuranceExpiry: '',
      mulkiyaExpiry: '',
      notes: '',
    },
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: (data) => {
      const payload = {
        plate: data.plate?.toUpperCase(),
        make: data.make,
        model: data.model,
        year: data.year ? Number(data.year) : undefined,
        color: data.color,
        vehicleType: data.vehicleType,
        supplierId: data.supplierId || undefined,
        chassisNumber: data.chassisNumber || undefined,
        engineNumber: data.engineNumber || undefined,
        registrationExpiry: data.registrationExpiry || undefined,
        insuranceExpiry: data.insuranceExpiry || undefined,
        mulkiyaExpiry: data.mulkiyaExpiry || undefined,
        monthlyRate: data.monthlyRate ? Number(data.monthlyRate) : undefined,
        contractStart: data.contractStart || undefined,
        contractEnd: data.contractEnd || undefined,
        contractNumber: data.contractNumber || undefined,
        depositAmount: data.depositAmount ? Number(data.depositAmount) : 0,
        notes: data.notes || undefined,
      };
      return createVehicle(payload);
    },
    onSuccess: () => {
      toast.success('Vehicle added');
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['fleet-summary'] });
      onSuccess?.();
      onClose();
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || 'Failed to create vehicle'),
  });

  return (
    <Modal title="Add vehicle" onClose={onClose} width={520}>
      <form onSubmit={handleSubmit((data) => save(data))}>
        <div style={sectionTitle}>Vehicle details</div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 14,
          }}
        >
          <div style={fieldStyle}>
            <label style={labelStyle}>Plate number *</label>
            <input
              {...register('plate', { required: true })}
              placeholder="e.g. DXB A 12345"
              style={{ textTransform: 'uppercase' }}
            />
            {errors.plate && (
              <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>
            )}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Vehicle type</label>
            <select {...register('vehicleType')}>
              {['Sedan', 'SUV', 'Van', 'Pickup', 'Motorcycle', 'Truck', 'Other'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 14,
          }}
        >
          <div style={fieldStyle}>
            <label style={labelStyle}>Make</label>
            <input {...register('make')} placeholder="e.g. Toyota" />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Model</label>
            <input {...register('model')} placeholder="e.g. Hiace" />
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '1fr 1fr 1fr',
            gap: 14,
          }}
        >
          <div style={fieldStyle}>
            <label style={labelStyle}>Year</label>
            <input type="number" {...register('year')} />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Color</label>
            <input {...register('color')} placeholder="e.g. White" />
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
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 14,
          }}
        >
          <div style={fieldStyle}>
            <label style={labelStyle}>Chassis number</label>
            <input {...register('chassisNumber')} style={{ fontFamily: 'var(--mono)' }} />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Engine number</label>
            <input {...register('engineNumber')} />
          </div>
        </div>

        {/* Document expiry dates */}
        <div style={sectionTitle}>Document expiry</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '1fr 1fr 1fr',
            gap: 14,
          }}
        >
          <div style={fieldStyle}>
            <label style={labelStyle}>Registration expiry</label>
            <input type="date" {...register('registrationExpiry')} />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Insurance expiry</label>
            <input type="date" {...register('insuranceExpiry')} />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Mulkiya expiry</label>
            <input type="date" {...register('mulkiyaExpiry')} />
          </div>
        </div>

        {/* Contract details */}
        <div style={sectionTitle}>Contract details</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 14,
          }}
        >
          <div style={fieldStyle}>
            <label style={labelStyle}>Monthly rate (AED)</label>
            <input type="number" {...register('monthlyRate')} />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Contract number</label>
            <input {...register('contractNumber')} />
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 14,
          }}
        >
          <div style={fieldStyle}>
            <label style={labelStyle}>Contract start</label>
            <input type="date" {...register('contractStart')} />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Contract end</label>
            <input type="date" {...register('contractEnd')} />
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Deposit amount (AED)</label>
          <input type="number" {...register('depositAmount')} placeholder="0" />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Notes</label>
          <textarea
            {...register('notes')}
            rows={3}
            placeholder="Optional notes..."
            style={{ resize: 'vertical' }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            marginTop: 8,
          }}
        >
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Saving...' : 'Add vehicle'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default AddFleetVehicleModal;
