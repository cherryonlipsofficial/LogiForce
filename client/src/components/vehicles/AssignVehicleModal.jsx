import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import Avatar from '../ui/Avatar';
import { assignVehicle } from '../../api/vehiclesApi';
import { getDrivers } from '../../api/driversApi';
import { useFormatters } from '../../hooks/useFormatters';

const getInitials = (name) =>
  (name || '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

const AssignVehicleModal = ({ vehicle, onClose, onSuccess }) => {
  const { n } = useFormatters();
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      expectedReturnDate: '',
      monthlyDeductionAmount: vehicle.activeContract?.monthlyRate || 0,
      notes: '',
    },
  });

  const [searchValue, setSearchValue] = useState('');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [searching, setSearching] = useState(false);
  const [apiError, setApiError] = useState(null);
  const debounceRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchDrivers = useCallback(async (query) => {
    if (!query || query.length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    setSearching(true);
    try {
      const data = await getDrivers({ status: 'active', search: query, limit: 10 });
      setResults(data.drivers || data || []);
      setShowDropdown(true);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchDrivers(val), 300);
  };

  const handleSelectDriver = (driver) => {
    if (driver.currentVehicleId) return;
    setSelectedDriver(driver);
    setSearchValue('');
    setShowDropdown(false);
    setResults([]);
    setApiError(null);
  };

  const clearDriver = () => {
    setSelectedDriver(null);
    setApiError(null);
  };

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => assignVehicle(vehicle._id, data),
    onSuccess: () => {
      toast.success(`Vehicle ${vehicle.plateNumber || vehicle.plate} assigned to ${selectedDriver.fullName || selectedDriver.name}`);
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['vehicle', vehicle._id] });
      qc.invalidateQueries({ queryKey: ['fleet-summary'] });
      qc.invalidateQueries({ queryKey: ['vehicle-current-assignment', vehicle._id] });
      qc.invalidateQueries({ queryKey: ['vehicle-assignment-history', vehicle._id] });
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      setApiError(err?.response?.data?.message || 'Failed to assign vehicle');
    },
  });

  const onSubmit = (formData) => {
    if (!selectedDriver) return;
    setApiError(null);
    mutate({
      driverId: selectedDriver._id,
      expectedReturnDate: formData.expectedReturnDate || undefined,
      monthlyDeductionAmount: formData.monthlyDeductionAmount ? Number(formData.monthlyDeductionAmount) : 0,
      notes: formData.notes || undefined,
    });
  };

  const contract = vehicle.activeContract;
  const driverHasVehicle = selectedDriver?.currentVehicleId;

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border2)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <Modal onClose={onClose} title="Assign vehicle" width={500}>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: -8, marginBottom: 12 }}>
        {vehicle.plateNumber || vehicle.plate} — {vehicle.make} {vehicle.model}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* API error display */}
        {apiError && (
          <div
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              color: '#f87171',
              lineHeight: 1.5,
            }}
          >
            {apiError}
          </div>
        )}

        {/* SECTION 1 — Vehicle summary */}
        <div
          style={{
            background: 'var(--surface2)',
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: 13,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 500 }}>
            {vehicle.plateNumber || vehicle.plate}
          </div>
          <div style={{ color: 'var(--text2)' }}>
            {vehicle.make} {vehicle.model}
          </div>
          <div style={{ color: 'var(--text3)', display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
            {vehicle.supplierName && <span>Supplier: {vehicle.supplierName}</span>}
            {contract?.monthlyRate != null && (
              <span>Monthly rate: AED {n(contract.monthlyRate.toLocaleString())}</span>
            )}
          </div>
        </div>

        {/* SECTION 2 — Driver search */}
        <div>
          <label style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
            Select driver
          </label>

          {/* Info banner */}
          <div
            style={{
              background: 'rgba(79,142,247,0.08)',
              border: '1px solid rgba(79,142,247,0.15)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
              color: 'var(--accent)',
              marginBottom: 10,
            }}
          >
            Only active drivers can be assigned a vehicle.
          </div>

          {selectedDriver ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(79,142,247,0.08)',
                border: '1px solid rgba(79,142,247,0.2)',
                borderRadius: 20,
                padding: '5px 10px 5px 6px',
                fontSize: 13,
              }}
            >
              <Avatar initials={getInitials(selectedDriver.fullName || selectedDriver.name)} size={22} />
              <span style={{ fontWeight: 500 }}>{selectedDriver.fullName || selectedDriver.name}</span>
              <button
                type="button"
                onClick={clearDriver}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text3)',
                  cursor: 'pointer',
                  fontSize: 16,
                  lineHeight: 1,
                  padding: '0 2px',
                }}
              >
                &times;
              </button>
            </div>
          ) : (
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchValue}
                onChange={handleSearchChange}
                placeholder="Search by name or employee code..."
                style={inputStyle}
              />
              {showDropdown && results.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    marginTop: 4,
                    maxHeight: 240,
                    overflowY: 'auto',
                    zIndex: 10,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                  }}
                >
                  {results.map((d) => {
                    const hasVehicle = !!d.currentVehicleId;
                    return (
                      <div
                        key={d._id}
                        onClick={() => handleSelectDriver(d)}
                        title={hasVehicle ? 'This driver already has a vehicle. Return it first.' : undefined}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          cursor: hasVehicle ? 'not-allowed' : 'pointer',
                          fontSize: 13,
                          borderBottom: '1px solid var(--border)',
                          transition: 'background .1s',
                          opacity: hasVehicle ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => { if (!hasVehicle) e.currentTarget.style.background = 'var(--surface2)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <Avatar initials={getInitials(d.fullName || d.name)} size={24} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{d.fullName || d.name}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{d.employeeCode}</span>
                          </div>
                          <div style={{ color: 'var(--text3)', fontSize: 11, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {d.clientId?.name && <span>{d.clientId.name}</span>}
                            {d.projectId?.name && <span>{d.projectId.name}</span>}
                          </div>
                          {hasVehicle && (
                            <span
                              style={{
                                display: 'inline-block',
                                marginTop: 3,
                                fontSize: 10,
                                background: 'rgba(245,158,11,0.12)',
                                border: '1px solid rgba(245,158,11,0.25)',
                                color: '#f59e0b',
                                borderRadius: 10,
                                padding: '1px 8px',
                              }}
                            >
                              Has vehicle: {d.vehiclePlate || 'assigned'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {showDropdown && results.length === 0 && searchValue && !searching && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    marginTop: 4,
                    padding: '12px',
                    fontSize: 13,
                    color: 'var(--text3)',
                    textAlign: 'center',
                  }}
                >
                  No active drivers found
                </div>
              )}
            </div>
          )}

          {/* Selected driver info card */}
          {selectedDriver && (
            <div
              style={{
                marginTop: 12,
                background: 'var(--surface2)',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 13,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Avatar initials={getInitials(selectedDriver.fullName || selectedDriver.name)} size={34} />
                <div>
                  <div style={{ fontWeight: 500 }}>{selectedDriver.fullName || selectedDriver.name}</div>
                  <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                    {selectedDriver.employeeCode}
                  </div>
                </div>
              </div>
              <div style={{ color: 'var(--text3)', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {(selectedDriver.clientId?.name || selectedDriver.clientName) && (
                  <span>Client: {selectedDriver.clientId?.name || selectedDriver.clientName}</span>
                )}
                {(selectedDriver.projectId?.name || selectedDriver.projectName) && (
                  <span>Project: {selectedDriver.projectId?.name || selectedDriver.projectName}</span>
                )}
                <span>
                  Current vehicle:{' '}
                  {driverHasVehicle ? (
                    <span style={{ color: '#f59e0b' }}>&#9888; Assigned</span>
                  ) : (
                    <span style={{ color: '#4ade80' }}>None</span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3 — Assignment details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
              Expected return date (optional)
            </label>
            <input
              type="date"
              {...register('expectedReturnDate')}
              min={new Date().toISOString().split('T')[0]}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
              Monthly salary deduction
            </label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 13,
                  color: 'var(--text3)',
                }}
              >
                AED
              </span>
              <input
                type="number"
                step="any"
                {...register('monthlyDeductionAmount', { min: 0 })}
                style={{ ...inputStyle, paddingLeft: 42 }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              This amount will be deducted from the driver's salary each month
            </div>
            <div
              style={{
                marginTop: 6,
                background: 'var(--surface2)',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11,
                color: 'var(--text3)',
              }}
            >
              Amount is locked at assignment and used for payroll
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
              Notes (optional)
            </label>
            <textarea
              {...register('notes')}
              rows={3}
              placeholder="Any notes about this assignment..."
              style={{
                ...inputStyle,
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        {/* FOOTER */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            paddingTop: 8,
            borderTop: '1px solid var(--border)',
          }}
        >
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" type="submit" disabled={!selectedDriver || isPending}>
            {isPending ? (
              <>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'spin 0.6s linear infinite',
                  }}
                />
                Assigning...
              </>
            ) : (
              'Assign vehicle'
            )}
          </Btn>
        </div>
      </form>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </Modal>
  );
};

export default AssignVehicleModal;
