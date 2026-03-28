import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import { createCategory } from '../../api/vehiclesApi';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const labelStyle = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text2)',
  marginBottom: 4,
  display: 'block',
};

const fieldStyle = { marginBottom: 14 };

const vehicleTypeOptions = [
  { value: 'car', label: 'Car' },
  { value: 'bike', label: 'Bike' },
  { value: 'van', label: 'Van' },
  { value: 'truck', label: 'Truck' },
  { value: 'cycle', label: 'Cycle' },
  { value: 'electric_bike', label: 'Electric bike' },
  { value: 'other', label: 'Other' },
];

const fuelOptions = ['Petrol', 'Diesel', 'Electric', 'Hybrid'];
const transmissionOptions = ['Manual', 'Automatic', 'CVT'];

const AddCategoryModal = ({ supplierId, supplierName, onClose, onSuccess }) => {
  const { isMobile } = useBreakpoint();
  const [showSpecs, setShowSpecs] = useState(false);
  const qc = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      type: 'car',
    },
  });

  const { mutate: save, isLoading } = useMutation({
    mutationFn: (data) =>
      createCategory({
        ...data,
        supplierId,
        defaultMonthlyRate: Number(data.defaultMonthlyRate),
        year: data.year ? Number(data.year) : undefined,
        specs: showSpecs
          ? {
              engineCC: data.engineCC ? Number(data.engineCC) : undefined,
              fuelType: data.fuelType || undefined,
              transmission: data.transmission || undefined,
              seats: data.seats ? Number(data.seats) : undefined,
              loadCapacityKg: data.loadCapacityKg
                ? Number(data.loadCapacityKg)
                : undefined,
            }
          : undefined,
      }),
    onSuccess: () => {
      toast.success('Category added');
      qc.invalidateQueries(['categories', supplierId]);
      onSuccess?.();
      onClose();
    },
    onError: (err) =>
      toast.error(
        err?.response?.data?.message || 'Failed to create category'
      ),
  });

  return (
    <Modal
      title={`Add vehicle category — ${supplierName}`}
      onClose={onClose}
      width={440}
    >
      <form onSubmit={handleSubmit((data) => save(data))}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Category name *</label>
          <input
            {...register('name', { required: true })}
            placeholder="e.g. Sedan Car, Bajaj Pulsar 150cc"
          />
          {errors.name && (
            <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>
          )}
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Vehicle type *</label>
          <select {...register('type', { required: true })}>
            {vehicleTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.type && (
            <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 14,
          }}
        >
          <div style={fieldStyle}>
            <label style={labelStyle}>Make *</label>
            <input
              {...register('make', { required: true })}
              placeholder="e.g. Toyota, Bajaj, Honda"
            />
            {errors.make && (
              <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>
            )}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Model *</label>
            <input
              {...register('model', { required: true })}
              placeholder="e.g. Camry 2.5L, Pulsar 150"
            />
            {errors.model && (
              <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>
            )}
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
            <label style={labelStyle}>Year (optional)</label>
            <input
              type="number"
              {...register('year', { min: 2015, max: 2025 })}
              placeholder="2024"
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Default monthly rate (AED) *</label>
            <input
              type="number"
              {...register('defaultMonthlyRate', { required: true })}
              placeholder="0"
            />
            {errors.defaultMonthlyRate && (
              <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>
            )}
          </div>
        </div>

        {/* Collapsible specs section */}
        <div style={{ marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setShowSpecs(!showSpecs)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {showSpecs ? '— Hide vehicle specs' : '+ Vehicle specs'}
          </button>

          {showSpecs && (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                background: 'var(--surface2)',
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: 14,
                }}
              >
                <div style={fieldStyle}>
                  <label style={labelStyle}>Engine CC</label>
                  <input
                    type="number"
                    {...register('engineCC')}
                    placeholder="e.g. 1500"
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Fuel type</label>
                  <select {...register('fuelType')}>
                    <option value="">Select</option>
                    {fuelOptions.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Transmission</label>
                  <select {...register('transmission')}>
                    <option value="">Select</option>
                    {transmissionOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Seats</label>
                  <input
                    type="number"
                    {...register('seats')}
                    placeholder="e.g. 5"
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Load capacity (kg)</label>
                  <input
                    type="number"
                    {...register('loadCapacityKg')}
                    placeholder="e.g. 500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Notes (optional)</label>
          <textarea
            {...register('notes')}
            rows={3}
            placeholder="Any additional notes..."
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
            {isLoading ? 'Adding...' : 'Add category'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default AddCategoryModal;
