import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import { createVehicle } from '../../api/vehiclesApi';
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

const contractTypes = [
  { value: 'monthly', label: 'Monthly', months: 1 },
  { value: 'quarterly', label: 'Quarterly', months: 3 },
  { value: '6months', label: '6 months', months: 6 },
  { value: '1year', label: '1 year', months: 12 },
  { value: '2years', label: '2 years', months: 24 },
  { value: '3years', label: '3 years', months: 36 },
  { value: 'custom', label: 'Custom', months: null },
];

const toISODate = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');

const AddVehicleModal = ({ category, supplierId, onClose, onSuccess }) => {
  const { isMobile, isTablet } = useBreakpoint();
  const qc = useQueryClient();

  const today = toISODate(new Date());

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm({
    defaultValues: {
      year: new Date().getFullYear(),
      contractType: 'monthly',
      durationMonths: 1,
      startDate: today,
      monthlyRate: category.defaultMonthlyRate || '',
      depositAmount: 0,
    },
  });

  const contractType = useWatch({ control, name: 'contractType' });
  const durationMonths = useWatch({ control, name: 'durationMonths' });
  const startDate = useWatch({ control, name: 'startDate' });

  // Auto-fill duration when contract type changes
  useEffect(() => {
    const ct = contractTypes.find((c) => c.value === contractType);
    if (ct && ct.months !== null) {
      setValue('durationMonths', ct.months);
    }
  }, [contractType, setValue]);

  // Compute end date
  const computedEndDate = (() => {
    if (!startDate || !durationMonths) return null;
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + Number(durationMonths));
    return d;
  })();

  const { mutate: save, isLoading } = useMutation({
    mutationFn: (data) =>
      createVehicle({
        supplierId,
        categoryId: category._id,
        plateNumber: data.plateNumber?.toUpperCase(),
        chassisNumber: data.chassisNumber || undefined,
        engineNumber: data.engineNumber || undefined,
        year: Number(data.year),
        color: data.color,
        registrationExpiry: data.registrationExpiry || undefined,
        insuranceExpiry: data.insuranceExpiry || undefined,
        mulkiyaExpiry: data.mulkiyaExpiry || undefined,
        contractData: {
          contractType: data.contractType,
          durationMonths: Number(data.durationMonths),
          startDate: data.startDate,
          endDate: computedEndDate?.toISOString(),
          monthlyRate: Number(data.monthlyRate),
          contractNumber: data.contractNumber || undefined,
          depositAmount: data.depositAmount
            ? Number(data.depositAmount)
            : 0,
        },
      }),
    onSuccess: () => {
      toast.success('Vehicle added');
      qc.invalidateQueries(['vehicles']);
      qc.invalidateQueries(['categories', supplierId]);
      onSuccess?.();
      onClose();
    },
    onError: (err) =>
      toast.error(
        err?.response?.data?.message || 'Failed to create vehicle'
      ),
  });

  return (
    <Modal
      title={`Add vehicle — ${category.make} ${category.model}`}
      onClose={onClose}
      width={520}
    >
      <form onSubmit={handleSubmit((data) => save(data))}>
        {/* SECTION 1 — Vehicle details */}
        <div style={sectionTitle}>Vehicle details</div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Category</label>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text2)',
              padding: '8px 12px',
              background: 'var(--surface2)',
              borderRadius: 8,
            }}
          >
            {category.make} {category.model}
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
            <label style={labelStyle}>Plate number *</label>
            <input
              {...register('plateNumber', { required: true })}
              placeholder="e.g. A 12345"
              style={{ textTransform: 'uppercase' }}
            />
            {errors.plateNumber && (
              <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>
            )}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Chassis number</label>
            <input
              {...register('chassisNumber')}
              placeholder="Optional"
              style={{ fontFamily: 'var(--mono)' }}
            />
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
            <label style={labelStyle}>Engine number</label>
            <input {...register('engineNumber')} placeholder="Optional" />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Year *</label>
            <input
              type="number"
              {...register('year', { required: true })}
            />
            {errors.year && (
              <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>
            )}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Color *</label>
            <input
              {...register('color', { required: true })}
              placeholder="e.g. White"
            />
            {errors.color && (
              <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>
            )}
          </div>
        </div>

        {/* Document expiry dates */}
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

        {/* SECTION 2 — Lease contract */}
        <div style={sectionTitle}>Lease contract</div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text3)',
            marginBottom: 14,
          }}
        >
          Add the contract details for this vehicle
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 14,
          }}
        >
          <div style={fieldStyle}>
            <label style={labelStyle}>Contract type *</label>
            <select {...register('contractType', { required: true })}>
              {contractTypes.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Duration (months)</label>
            <input
              type="number"
              {...register('durationMonths', { required: true, min: 1 })}
              readOnly={contractType !== 'custom'}
            />
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
            <label style={labelStyle}>Start date *</label>
            <input
              type="date"
              {...register('startDate', { required: true })}
            />
            {errors.startDate && (
              <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>
            )}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>End date</label>
            <div
              style={{
                fontSize: 13,
                color: 'var(--text2)',
                padding: '8px 12px',
                background: 'var(--surface2)',
                borderRadius: 8,
              }}
            >
              {computedEndDate
                ? `Ends ${computedEndDate.toLocaleDateString()}`
                : '—'}
            </div>
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
            <label style={labelStyle}>Monthly rate (AED) *</label>
            <input
              type="number"
              {...register('monthlyRate', { required: true })}
            />
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
              Default rate from category: AED {category.defaultMonthlyRate || 0}
            </div>
            {errors.monthlyRate && (
              <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>
            )}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Contract number</label>
            <input {...register('contractNumber')} placeholder="Optional" />
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Deposit amount (AED)</label>
          <input
            type="number"
            {...register('depositAmount')}
            placeholder="0"
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
          <Btn variant="primary" type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save vehicle + contract'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default AddVehicleModal;
