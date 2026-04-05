import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import { updateVehicle } from '../../api/vehiclesApi';
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

const toISODate = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');

const EditVehicleModal = ({ vehicle, onClose, onSuccess }) => {
  const { isMobile, isTablet } = useBreakpoint();
  const qc = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      plate: vehicle.plate || vehicle.plateNumber || '',
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: vehicle.year || '',
      color: vehicle.color || '',
      vehicleType: vehicle.vehicleType || 'Sedan',
      chassisNumber: vehicle.chassisNumber || '',
      engineNumber: vehicle.engineNumber || '',
      registrationExpiry: toISODate(vehicle.registrationExpiry),
      insuranceExpiry: toISODate(vehicle.insuranceExpiry),
      mulkiyaExpiry: toISODate(vehicle.mulkiyaExpiry),
      monthlyRate: vehicle.monthlyRate || '',
      contractStart: toISODate(vehicle.contractStart),
      contractEnd: toISODate(vehicle.contractEnd),
      contractNumber: vehicle.contractNumber || '',
      depositAmount: vehicle.depositAmount || 0,
      notes: vehicle.notes || '',
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
      return updateVehicle(vehicle._id, payload);
    },
    onSuccess: () => {
      toast.success('Vehicle updated');
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['vehicle', vehicle._id] });
      qc.invalidateQueries({ queryKey: ['fleet-summary'] });
      onSuccess?.();
      onClose();
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || 'Failed to update vehicle'),
  });

  return (
    <Modal title={`Edit vehicle — ${vehicle.plate || vehicle.plateNumber || ''}`} onClose={onClose} width={520}>
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
              placeholder="e.g. A 12345"
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
            <label style={labelStyle}>Chassis number</label>
            <input {...register('chassisNumber')} style={{ fontFamily: 'var(--mono)' }} />
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Engine number</label>
          <input {...register('engineNumber')} />
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
            {isPending ? 'Saving...' : 'Save changes'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default EditVehicleModal;
