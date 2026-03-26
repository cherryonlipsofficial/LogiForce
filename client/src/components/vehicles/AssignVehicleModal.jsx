import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import Avatar from '../ui/Avatar';
import { assignVehicle } from '../../api/vehiclesApi';
import { getDrivers } from '../../api/driversApi';

const getInitials = (name) =>
  (name || '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

const AssignVehicleModal = ({ vehicle, onClose, onSuccess }) => {
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: { expectedReturnDate: '' },
  });

  const [searchValue, setSearchValue] = useState('');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
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
      const data = await getDrivers({ status: 'active', search: query, limit: 8 });
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
    setSelectedDriver(driver);
    setSearchValue('');
    setShowDropdown(false);
    setResults([]);
  };

  const clearDriver = () => {
    setSelectedDriver(null);
  };

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => assignVehicle(vehicle._id, data),
    onSuccess: () => {
      toast.success(`Vehicle assigned to ${selectedDriver.name}`);
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to assign vehicle');
    },
  });

  const onSubmit = (formData) => {
    if (!selectedDriver) return;
    mutate({
      driverId: selectedDriver._id,
      expectedReturnDate: formData.expectedReturnDate || undefined,
    });
  };

  const contract = vehicle.activeContract;
  const driverHasVehicle = selectedDriver?.currentVehicle || selectedDriver?.currentVehicleId;

  return (
    <Modal onClose={onClose} title={`Assign driver to ${vehicle.plateNumber}`} width={480}>
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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
          <div style={{ fontWeight: 500 }}>
            {vehicle.make} {vehicle.model}
            <span style={{ color: 'var(--text3)', fontWeight: 400 }}> — {vehicle.category || vehicle.type}</span>
          </div>
          <div style={{ color: 'var(--text3)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {vehicle.supplierName && <span>Supplier: {vehicle.supplierName}</span>}
            <span style={{ fontFamily: 'var(--mono, "DM Mono", monospace)' }}>{vehicle.plateNumber}</span>
            {contract?.monthlyRate != null && (
              <span>Monthly rate: AED {contract.monthlyRate.toLocaleString()}</span>
            )}
          </div>
        </div>

        {/* SECTION 2 — Driver search */}
        <div>
          <label style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
            Select driver
          </label>

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
              <Avatar initials={getInitials(selectedDriver.name)} size={22} />
              <span style={{ fontWeight: 500 }}>{selectedDriver.name}</span>
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
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border2)',
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
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
                  {results.map((d) => (
                    <div
                      key={d._id}
                      onClick={() => handleSelectDriver(d)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        cursor: 'pointer',
                        fontSize: 13,
                        borderBottom: '1px solid var(--border)',
                        transition: 'background .1s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface2)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Avatar initials={getInitials(d.name)} size={30} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>{d.name}</div>
                        <div style={{ color: 'var(--text3)', fontSize: 11, display: 'flex', gap: 8 }}>
                          <span style={{ fontFamily: 'var(--mono, "DM Mono", monospace)' }}>{d.employeeCode}</span>
                          {d.projectName && <span>{d.projectName}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
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
                <Avatar initials={getInitials(selectedDriver.name)} size={34} />
                <div>
                  <div style={{ fontWeight: 500 }}>{selectedDriver.name}</div>
                  <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono, "DM Mono", monospace)', fontSize: 11 }}>
                    {selectedDriver.employeeCode}
                  </div>
                </div>
              </div>
              <div style={{ color: 'var(--text3)', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {selectedDriver.clientName && <span>Client: {selectedDriver.clientName}</span>}
                {selectedDriver.projectName && <span>Project: {selectedDriver.projectName}</span>}
                <span>
                  Current vehicle:{' '}
                  {driverHasVehicle ? (
                    <span style={{ color: '#f59e0b' }}>
                      &#9888; {selectedDriver.currentVehicle?.plateNumber || selectedDriver.currentVehiclePlate || 'Assigned'}
                    </span>
                  ) : (
                    <span style={{ color: '#4ade80' }}>None</span>
                  )}
                </span>
              </div>

              {driverHasVehicle && (
                <div
                  style={{
                    marginTop: 10,
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.2)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 12,
                    color: '#f59e0b',
                    lineHeight: 1.5,
                  }}
                >
                  &#9888; This driver is currently assigned{' '}
                  <strong>
                    {selectedDriver.currentVehicle?.plateNumber || selectedDriver.currentVehiclePlate || 'a vehicle'}
                    {selectedDriver.currentVehicle
                      ? ` — ${selectedDriver.currentVehicle.make} ${selectedDriver.currentVehicle.model}`
                      : ''}
                  </strong>
                  . Assigning a new vehicle will NOT automatically return the current one. Please return the current vehicle first, or confirm this is intentional.
                </div>
              )}
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
              placeholder="Open-ended"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border2)',
                background: 'var(--surface2)',
                color: 'var(--text)',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {contract?.monthlyRate != null && (
            <div
              style={{
                background: 'rgba(79,142,247,0.08)',
                borderRadius: 8,
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500, marginBottom: 4 }}>
                Monthly deduction from driver salary
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                AED {contract.monthlyRate.toLocaleString()} / month
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                This amount will be deducted from driver salary each month
              </div>
            </div>
          )}
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
              'Confirm assignment'
            )}
          </Btn>
        </div>
      </form>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </Modal>
  );
};

export default AssignVehicleModal;
