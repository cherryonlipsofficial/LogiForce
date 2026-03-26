import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import SidePanel from '../ui/SidePanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import Badge from '../ui/Badge';
import Btn from '../ui/Btn';
import SectionHeader from '../ui/SectionHeader';
import Avatar from '../ui/Avatar';
import { useAuth } from '../../context/AuthContext';
import {
  getVehicle,
  renewContract,
  createContract,
  terminateContract,
  offHireVehicle,
} from '../../api/vehiclesApi';

/* ── helpers ── */
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const expiryBadge = (dateStr) => {
  if (!dateStr) return <Badge variant="default">—</Badge>;
  const now = new Date();
  const d = new Date(dateStr);
  const diffDays = Math.ceil((d - now) / 86400000);
  if (diffDays < 0) return <Badge variant="danger">Expired</Badge>;
  if (diffDays < 30) return <Badge variant="warning">Expires in {diffDays} days</Badge>;
  return <Badge variant="success">Valid</Badge>;
};

const vehicleStatusVariant = (s) => {
  const map = { available: 'success', assigned: 'info', off_hired: 'danger', maintenance: 'warning' };
  return map[s] || 'default';
};

const vehicleStatusLabel = (s) => {
  const map = { available: 'Available', assigned: 'Assigned', off_hired: 'Off-hired', maintenance: 'Maintenance' };
  return map[s] || s;
};

/* ── styles ── */
const label = { fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' };
const val = { fontSize: 13, color: 'var(--text)', textAlign: 'right' };
const mono = { fontFamily: 'var(--mono)' };
const section = { padding: '0 20px', marginBottom: 20 };
const gridRow = { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' };

/* ── sub-components ── */
const DetailRow = ({ k, v, isMono }) => (
  <div style={gridRow}>
    <span style={label}>{k}</span>
    <span style={{ ...val, ...(isMono ? mono : {}) }}>{v ?? '—'}</span>
  </div>
);

const RenewForm = ({ vehicleId, onDone }) => {
  const [form, setForm] = useState({ contractType: '1_year', durationMonths: 12, startDate: '', monthlyRate: '' });
  const qc = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: (data) => renewContract(vehicleId, data),
    onSuccess: () => { toast.success('Contract renewed'); qc.invalidateQueries({ queryKey: ['vehicle', vehicleId] }); onDone(); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to renew'),
  });
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const inp = { width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'var(--sans)' };
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <select value={form.contractType} onChange={set('contractType')} style={inp}>
        <option value="1_year">1 year lease</option>
        <option value="6_month">6 month lease</option>
        <option value="monthly">Monthly</option>
      </select>
      <input type="number" placeholder="Duration (months)" value={form.durationMonths} onChange={set('durationMonths')} style={inp} />
      <input type="date" value={form.startDate} onChange={set('startDate')} style={inp} />
      <input type="number" placeholder="Monthly rate (AED)" value={form.monthlyRate} onChange={set('monthlyRate')} style={inp} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant="primary" small onClick={() => mutate(form)} disabled={isPending}>Save renewal</Btn>
        <Btn small onClick={onDone}>Cancel</Btn>
      </div>
    </div>
  );
};

const ContractForm = ({ vehicleId, onDone }) => {
  const [form, setForm] = useState({ contractType: '1_year', durationMonths: 12, startDate: '', monthlyRate: '' });
  const qc = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: (data) => createContract(vehicleId, data),
    onSuccess: () => { toast.success('Contract created'); qc.invalidateQueries({ queryKey: ['vehicle', vehicleId] }); onDone(); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to create contract'),
  });
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const inp = { width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'var(--sans)' };
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <select value={form.contractType} onChange={set('contractType')} style={inp}>
        <option value="1_year">1 year lease</option>
        <option value="6_month">6 month lease</option>
        <option value="monthly">Monthly</option>
      </select>
      <input type="number" placeholder="Duration (months)" value={form.durationMonths} onChange={set('durationMonths')} style={inp} />
      <input type="date" value={form.startDate} onChange={set('startDate')} style={inp} />
      <input type="number" placeholder="Monthly rate (AED)" value={form.monthlyRate} onChange={set('monthlyRate')} style={inp} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant="primary" small onClick={() => mutate(form)} disabled={isPending}>Save contract</Btn>
        <Btn small onClick={onDone}>Cancel</Btn>
      </div>
    </div>
  );
};

const TerminateForm = ({ vehicleId, onDone, onClose }) => {
  const [reason, setReason] = useState('');
  const qc = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: (data) => terminateContract(vehicleId, data),
    onSuccess: () => { toast.success('Contract terminated'); qc.invalidateQueries({ queryKey: ['vehicle', vehicleId] }); onDone(); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to terminate'),
  });
  return (
    <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 12, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        placeholder="Reason for termination..."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        style={{ width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'var(--sans)', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant="danger" small onClick={() => mutate({ reason })} disabled={isPending || !reason.trim()}>Confirm termination</Btn>
        <Btn small onClick={onDone}>Cancel</Btn>
      </div>
    </div>
  );
};

/* ── main component ── */
const VehicleDetailPanel = ({ vehicleId, onClose, onAssignClick, onReturnClick }) => {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const { data, isLoading } = useQuery({
    queryKey: ['vehicle', vehicleId],
    queryFn: () => getVehicle(vehicleId),
    enabled: !!vehicleId,
  });

  const [showRenew, setShowRenew] = useState(false);
  const [showTerminate, setShowTerminate] = useState(false);
  const [showAddContract, setShowAddContract] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [offHireConfirm, setOffHireConfirm] = useState(false);
  const [offHireReason, setOffHireReason] = useState('');

  const qc = useQueryClient();
  const offHireMut = useMutation({
    mutationFn: (d) => offHireVehicle(vehicleId, d),
    onSuccess: () => {
      toast.success('Vehicle off-hired');
      qc.invalidateQueries({ queryKey: ['vehicle', vehicleId] });
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['fleet-summary'] });
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to off-hire'),
  });

  const vehicle = data?.data || data;
  const activeContract = vehicle?.activeContract;
  const history = vehicle?.assignmentHistory || [];

  return (
    <SidePanel onClose={onClose} width={560}>
      {isLoading || !vehicle ? (
        <LoadingSpinner style={{ flex: 1 }} />
      ) : (
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* ── HEADER ── */}
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 20, fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--text)' }}>
                {vehicle.plateNumber}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
                {vehicle.make} {vehicle.model} {vehicle.year}
              </div>
              {vehicle.supplierName && (
                <span style={{ display: 'inline-block', marginTop: 6, fontSize: 11, color: 'var(--text3)', background: 'var(--surface3)', padding: '2px 8px', borderRadius: 10 }}>
                  {vehicle.supplierName}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Badge variant={vehicleStatusVariant(vehicle.status)}>{vehicleStatusLabel(vehicle.status)}</Badge>
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 20, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          </div>

          {/* ── SECTION 1: Vehicle info ── */}
          <div style={{ ...section, marginTop: 18 }}>
            <SectionHeader title="Vehicle details" />
            <DetailRow k="Category" v={vehicle.categoryName} />
            <DetailRow k="Make / Model" v={`${vehicle.make} ${vehicle.model}`} />
            <DetailRow k="Year" v={vehicle.year} />
            <DetailRow k="Color" v={vehicle.color} />
            <DetailRow k="Chassis no." v={vehicle.chassisNumber} isMono />
            <DetailRow k="Engine no." v={vehicle.engineNumber} isMono />
            <DetailRow k="Odometer" v={vehicle.odometer != null ? `${vehicle.odometer.toLocaleString()} km` : '—'} />

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, fontWeight: 500 }}>
                Document expiry
              </div>
              <div style={gridRow}>
                <span style={label}>Registration expiry</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...val, fontSize: 12 }}>{fmt(vehicle.registrationExpiry)}</span>
                  {expiryBadge(vehicle.registrationExpiry)}
                </span>
              </div>
              <div style={gridRow}>
                <span style={label}>Insurance expiry</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...val, fontSize: 12 }}>{fmt(vehicle.insuranceExpiry)}</span>
                  {expiryBadge(vehicle.insuranceExpiry)}
                </span>
              </div>
              <div style={gridRow}>
                <span style={label}>Mulkiya expiry</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...val, fontSize: 12 }}>{fmt(vehicle.mulkiyaExpiry)}</span>
                  {expiryBadge(vehicle.mulkiyaExpiry)}
                </span>
              </div>
            </div>
          </div>

          {/* ── SECTION 2: Active contract ── */}
          <div style={section}>
            <SectionHeader title="Lease contract" />
            {activeContract ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>
                    {activeContract.contractNumber}
                  </span>
                  <Badge variant="info">{activeContract.typeName || activeContract.contractType?.replace('_', ' ') || 'Lease'}</Badge>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
                  {fmt(activeContract.startDate)} → {fmt(activeContract.endDate)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>Monthly rate</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 16, color: '#4ade80', fontWeight: 500 }}>
                    AED {Number(activeContract.monthlyRate || 0).toLocaleString()}
                  </span>
                </div>
                {activeContract.totalValue != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>Total contract value</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text2)' }}>
                      AED {Number(activeContract.totalValue).toLocaleString()}
                    </span>
                  </div>
                )}

                {/* Days remaining */}
                {activeContract.endDate && (() => {
                  const daysLeft = Math.ceil((new Date(activeContract.endDate) - new Date()) / 86400000);
                  const color = daysLeft > 90 ? '#4ade80' : daysLeft > 30 ? '#fbbf24' : '#f87171';
                  return (
                    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 24, fontWeight: 600, fontFamily: 'var(--mono)', color }}>{daysLeft}</span>
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>days remaining</span>
                    </div>
                  );
                })()}

                {/* Admin actions */}
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn small onClick={() => { setShowRenew(!showRenew); setShowTerminate(false); }}>Renew contract</Btn>
                    <Btn small variant="danger" onClick={() => { setShowTerminate(!showTerminate); setShowRenew(false); }}>Terminate contract</Btn>
                  </div>
                )}
                {showRenew && <RenewForm vehicleId={vehicleId} onDone={() => setShowRenew(false)} />}
                {showTerminate && <TerminateForm vehicleId={vehicleId} onDone={() => setShowTerminate(false)} onClose={onClose} />}
              </div>
            ) : (
              <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#fbbf24', marginBottom: 8 }}>No active contract</div>
                {isAdmin && (
                  <>
                    <Btn small variant="primary" onClick={() => setShowAddContract(!showAddContract)}>Add contract</Btn>
                    {showAddContract && <ContractForm vehicleId={vehicleId} onDone={() => setShowAddContract(false)} />}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── SECTION 3: Current assignment ── */}
          <div style={section}>
            <SectionHeader title="Current assignment" />
            {vehicle.status === 'assigned' && vehicle.currentDriverId ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <Avatar initials={(vehicle.currentDriverName || '??').split(' ').map((n) => n[0]).join('').slice(0, 2)} size={36} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{vehicle.currentDriverName}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{vehicle.currentDriverCode}</div>
                  </div>
                </div>
                <DetailRow k="Client" v={vehicle.clientName} />
                <DetailRow k="Project" v={vehicle.projectName} />
                <DetailRow k="Assigned since" v={fmt(vehicle.assignedDate)} />
                <DetailRow k="Monthly deduction" v={vehicle.monthlyDeductionAmount != null ? `AED ${Number(vehicle.monthlyDeductionAmount).toLocaleString()}` : '—'} isMono />
                <DetailRow k="Expected return" v={vehicle.expectedReturnDate ? fmt(vehicle.expectedReturnDate) : 'Open-ended'} />
                {onReturnClick && (
                  <Btn variant="danger" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => { onReturnClick(vehicle); onClose(); }}>
                    Return vehicle
                  </Btn>
                )}
              </div>
            ) : vehicle.status === 'available' ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>Available for assignment</span>
                </div>
                {onAssignClick && (
                  <Btn variant="primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { onAssignClick(vehicle); onClose(); }}>
                    Assign driver
                  </Btn>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>—</div>
            )}
          </div>

          {/* ── SECTION 4: Assignment history (collapsible) ── */}
          <div style={section}>
            <button
              type="button"
              onClick={() => setHistoryOpen(!historyOpen)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, color: 'var(--text2)', fontSize: 12, fontWeight: 500, fontFamily: 'var(--sans)' }}
            >
              <span style={{ fontSize: 10 }}>{historyOpen ? '▾' : '▸'}</span>
              Assignment history ({history.length})
            </button>
            {historyOpen && (
              <div style={{ marginTop: 10 }}>
                {history.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>No previous assignments</div>
                ) : (
                  history.map((h, i) => (
                    <div key={h._id || i} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                      {/* timeline line + dot */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12, flexShrink: 0 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                        {i < history.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--border2)', marginTop: 2 }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontSize: 13, color: 'var(--text)' }}>{h.driverName}</span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{h.employeeCode}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                          {fmt(h.assignedDate)} → {h.returnedDate ? fmt(h.returnedDate) : 'Present'}
                        </div>
                        {h.assignedDate && (
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                            Duration: {Math.ceil(((h.returnedDate ? new Date(h.returnedDate) : new Date()) - new Date(h.assignedDate)) / 86400000)} days
                          </div>
                        )}
                        {h.returnedDate && h.conditionOnReturn && (
                          <Badge variant={h.conditionOnReturn === 'good' ? 'success' : h.conditionOnReturn === 'damaged' ? 'danger' : 'warning'} style={{ marginTop: 4 }}>
                            {h.conditionOnReturn}
                          </Badge>
                        )}
                        {h.damagePenalty > 0 && (
                          <div style={{ fontSize: 11, color: '#f87171', fontFamily: 'var(--mono)', marginTop: 2 }}>
                            Damage penalty: AED {Number(h.damagePenalty).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── SECTION 5: Off-hire (admin only) ── */}
          {isAdmin && (
            <div style={{ borderTop: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.04)', padding: 14, margin: '0 0 0 0' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5, marginBottom: 10 }}>
                Off-hiring this vehicle will terminate the active contract and permanently remove it from the active fleet.
              </div>
              {!offHireConfirm ? (
                <Btn variant="danger" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setOffHireConfirm(true)}>
                  Off-hire this vehicle
                </Btn>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Reason for off-hire (required)"
                    value={offHireReason}
                    onChange={(e) => setOffHireReason(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'var(--sans)' }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn variant="danger" small onClick={() => offHireMut.mutate({ terminationReason: offHireReason })} disabled={offHireMut.isPending || !offHireReason.trim()}>
                      Confirm off-hire
                    </Btn>
                    <Btn small onClick={() => { setOffHireConfirm(false); setOffHireReason(''); }}>Cancel</Btn>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </SidePanel>
  );
};

export default VehicleDetailPanel;
