import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import KpiCard from '../../components/ui/KpiCard';
import Modal from '../../components/ui/Modal';
import Btn from '../../components/ui/Btn';
import StatusBadge from '../../components/ui/StatusBadge';
import SidePanel from '../../components/ui/SidePanel';
import SectionHeader from '../../components/ui/SectionHeader';
import { useFormatters } from '../../hooks/useFormatters';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { usePermission } from '../../hooks/usePermission';
import {
  getSimSummary,
  getSimCards,
  getSimCard,
  createSimCard,
  updateSimCard,
  deleteSimCard,
  assignSim,
  returnSim,
  getSimAssignmentHistory,
  bulkImportSims,
  importSimBills,
  getSimBills,
  getSimBill,
  waiveBillAllocation,
} from '../../api/simcardsApi';
import { getDrivers } from '../../api/driversApi';

const formatDate = (val) => {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const tabPill = (active) => ({
  padding: '7px 18px',
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 20,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--sans)',
  transition: 'all 0.15s ease',
  background: active ? 'var(--accent)' : 'var(--surface3)',
  color: active ? '#fff' : 'var(--text2)',
});

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border2)',
  background: 'var(--surface2)',
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'var(--sans)',
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  color: 'var(--text3)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

// ── Add SIM Modal ──
const AddSimModal = ({ onClose, onSaved }) => {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (data) => {
    setSubmitting(true);
    try {
      await createSimCard({
        ...data,
        monthlyPlanCost: data.monthlyPlanCost ? Number(data.monthlyPlanCost) : 0,
      });
      toast.success('SIM card created');
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create SIM');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Add SIM card" onClose={onClose} width={440}>
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>SIM Number *</label>
          <input {...register('simNumber', { required: 'Required' })} style={inputStyle} placeholder="e.g. 0501234567" />
          {errors.simNumber && <span style={{ fontSize: 11, color: '#f87171' }}>{errors.simNumber.message}</span>}
        </div>
        <div>
          <label style={labelStyle}>Operator *</label>
          <select {...register('operator', { required: 'Required' })} style={inputStyle}>
            <option value="">Select...</option>
            <option value="Etisalat">Etisalat</option>
            <option value="Du">Du</option>
            <option value="Virgin">Virgin</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Plan Name</label>
          <input {...register('planName')} style={inputStyle} placeholder="e.g. Business 100" />
        </div>
        <div>
          <label style={labelStyle}>Monthly Plan Cost (AED)</label>
          <input {...register('monthlyPlanCost')} type="number" step="0.01" style={inputStyle} placeholder="0.00" />
        </div>
        <div>
          <label style={labelStyle}>Notes</label>
          <textarea {...register('notes')} style={{ ...inputStyle, minHeight: 60 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Btn variant="ghost" onClick={onClose} type="button">Cancel</Btn>
          <Btn type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create SIM'}</Btn>
        </div>
      </form>
    </Modal>
  );
};

// ── Assign SIM Modal ──
const AssignSimModal = ({ sim, onClose, onSaved }) => {
  const [driverSearch, setDriverSearch] = useState('');
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: driversData } = useQuery({
    queryKey: ['drivers-for-assign', driverSearch],
    queryFn: () => getDrivers({ search: driverSearch, status: 'active', limit: 20 }),
    enabled: driverSearch.length >= 2,
  });
  const drivers = driversData?.data || [];

  const handleAssign = async () => {
    if (!selectedDriver) return toast.error('Select a driver');
    setSubmitting(true);
    try {
      await assignSim(sim._id, { driverId: selectedDriver._id, notes });
      toast.success('SIM assigned');
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to assign');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Assign SIM ${sim.simNumber}`} onClose={onClose} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {sim.currentDriverId && (
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#fbbf24' }}>
            Will auto-return from {sim.currentDriverId?.fullName || 'current driver'}
          </div>
        )}
        <div>
          <label style={labelStyle}>Search Driver</label>
          <input
            style={inputStyle}
            placeholder="Type driver name..."
            value={driverSearch}
            onChange={(e) => { setDriverSearch(e.target.value); setSelectedDriver(null); }}
          />
          {driverSearch.length >= 2 && !selectedDriver && (
            <div style={{ maxHeight: 160, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4 }}>
              {drivers.length === 0 ? (
                <div style={{ padding: 10, fontSize: 12, color: 'var(--text3)' }}>No active drivers found</div>
              ) : drivers.map((d) => (
                <div
                  key={d._id}
                  onClick={() => { setSelectedDriver(d); setDriverSearch(d.fullName); }}
                  style={{ padding: '8px 10px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                >
                  {d.fullName} <span style={{ color: 'var(--text3)', fontSize: 11 }}>{d.employeeCode}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...inputStyle, minHeight: 50 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={handleAssign} disabled={submitting || !selectedDriver}>{submitting ? 'Assigning...' : 'Assign'}</Btn>
        </div>
      </div>
    </Modal>
  );
};

// ── Return SIM Modal ──
const ReturnSimModal = ({ sim, onClose, onSaved }) => {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleReturn = async () => {
    setSubmitting(true);
    try {
      await returnSim(sim._id, { notes });
      toast.success('SIM returned');
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to return');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Return SIM ${sim.simNumber}`} onClose={onClose} width={400}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          Currently assigned to: <strong>{sim.currentDriverId?.fullName || '—'}</strong>
        </div>
        <div>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...inputStyle, minHeight: 50 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={handleReturn} disabled={submitting} style={{ background: '#ef4444' }}>
            {submitting ? 'Returning...' : 'Confirm Return'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
};

// ── Import Bills Modal ──
const ImportBillsModal = ({ onClose, onSaved }) => {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error('Select a ZIP file');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await importSimBills(formData);
      setResults(res.data);
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal title="Import SIM Bills" onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!results ? (
          <>
            <div style={{
              border: '2px dashed var(--border2)',
              borderRadius: 10,
              padding: '24px 16px',
              textAlign: 'center',
              cursor: 'pointer',
            }} onClick={() => fileRef.current?.click()}>
              <input type="file" ref={fileRef} accept=".zip" style={{ display: 'none' }} />
              <div style={{ fontSize: 32, opacity: 0.4, marginBottom: 8 }}>&#128230;</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>Click to select a ZIP file</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Contains PDF invoices + FileIndex.csv</div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              <Btn onClick={handleUpload} disabled={uploading}>{uploading ? 'Importing...' : 'Upload & Import'}</Btn>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ background: 'rgba(74,222,128,0.1)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#4ade80' }}>{results.imported}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Imported</div>
              </div>
              <div style={{ background: 'rgba(245,158,11,0.1)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#fbbf24' }}>{results.newSimsCreated}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>New SIMs</div>
              </div>
              <div style={{ background: 'rgba(248,113,113,0.1)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#f87171' }}>{results.errors?.length || 0}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Errors</div>
              </div>
            </div>
            {results.errors?.length > 0 && (
              <div style={{ maxHeight: 150, overflowY: 'auto', background: 'var(--surface2)', borderRadius: 8, padding: 10 }}>
                {results.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#f87171', marginBottom: 4 }}>
                    {e.file}: {e.error}
                  </div>
                ))}
              </div>
            )}
            <Btn onClick={onClose} style={{ alignSelf: 'flex-end' }}>Done</Btn>
          </>
        )}
      </div>
    </Modal>
  );
};

// ── Bulk Import SIM Modal ──
const BulkImportSimModal = ({ onClose, onSaved }) => {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);
  const [fileName, setFileName] = useState('');

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error('Select a CSV file');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await bulkImportSims(formData);
      setResults(res.data);
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Bulk import failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = () => {
    const file = fileRef.current?.files?.[0];
    setFileName(file ? file.name : '');
  };

  return (
    <Modal title="Bulk Import SIM Cards" onClose={onClose} width={540}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!results ? (
          <>
            <div style={{
              border: '2px dashed var(--border2)',
              borderRadius: 10,
              padding: '24px 16px',
              textAlign: 'center',
              cursor: 'pointer',
            }} onClick={() => fileRef.current?.click()}>
              <input type="file" ref={fileRef} accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
              <div style={{ fontSize: 32, opacity: 0.4, marginBottom: 8 }}>&#128196;</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                {fileName || 'Click to select a CSV file'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Upload a CSV with SIM card details to import
              </div>
            </div>

            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, fontSize: 11, color: 'var(--text3)' }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text2)', fontSize: 12 }}>CSV Format</div>
              <div style={{ marginBottom: 4 }}>Required column: <strong style={{ color: 'var(--text)' }}>SIM Number</strong></div>
              <div style={{ marginBottom: 6 }}>Optional columns: Operator, Plan, Monthly Plan Cost, Account Number, Account Owner, Status, Notes</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, background: 'var(--surface)', borderRadius: 6, padding: '8px 10px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                SIM Number,Operator,Plan,Monthly Plan Cost,Status<br />
                0501234567,etisalat,Business 100,100,active<br />
                0559876543,du,Premium,150,active
              </div>
              <div style={{ marginTop: 6 }}>
                Existing SIM numbers will be <strong style={{ color: 'var(--text2)' }}>updated</strong> with new values. New SIM numbers will be <strong style={{ color: 'var(--text2)' }}>created</strong>.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              <Btn onClick={handleUpload} disabled={uploading}>{uploading ? 'Importing...' : 'Upload & Import'}</Btn>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              <div style={{ background: 'rgba(74,222,128,0.1)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#4ade80' }}>{results.created}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Created</div>
              </div>
              <div style={{ background: 'rgba(96,165,250,0.1)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#60a5fa' }}>{results.updated}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Updated</div>
              </div>
              <div style={{ background: 'rgba(245,158,11,0.1)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#fbbf24' }}>{results.skipped}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Skipped</div>
              </div>
              <div style={{ background: 'rgba(248,113,113,0.1)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#f87171' }}>{results.errors?.length || 0}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Errors</div>
              </div>
            </div>
            {results.errors?.length > 0 && (
              <div style={{ maxHeight: 150, overflowY: 'auto', background: 'var(--surface2)', borderRadius: 8, padding: 10 }}>
                {results.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#f87171', marginBottom: 4 }}>
                    Row {e.row}: {e.error}
                  </div>
                ))}
              </div>
            )}
            <Btn onClick={onClose} style={{ alignSelf: 'flex-end' }}>Done</Btn>
          </>
        )}
      </div>
    </Modal>
  );
};

// ── SIM Detail Panel ──
const SimDetailPanel = ({ simId, onClose }) => {
  const { n } = useFormatters();

  const { data: simData } = useQuery({
    queryKey: ['simcard', simId],
    queryFn: () => getSimCard(simId),
    enabled: !!simId,
  });
  const sim = simData?.data;

  const { data: historyData } = useQuery({
    queryKey: ['sim-history', simId],
    queryFn: () => getSimAssignmentHistory(simId, { limit: 50 }),
    enabled: !!simId,
  });
  const history = historyData?.data || [];

  const { data: billsData } = useQuery({
    queryKey: ['sim-bills', simId],
    queryFn: () => getSimBills({ simNumber: sim?.simNumber, limit: 6 }),
    enabled: !!sim?.simNumber,
  });
  const bills = billsData?.data || [];

  if (!sim) return null;

  return (
    <SidePanel title={`SIM ${sim.simNumber}`} onClose={onClose}>
      <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operator</div>
            <div style={{ fontSize: 13 }}>{sim.operator}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</div>
            <StatusBadge status={sim.status} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plan</div>
            <div style={{ fontSize: 13 }}>{sim.planName || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly Cost</div>
            <div style={{ fontSize: 13 }}>AED {n(sim.monthlyPlanCost || 0)}</div>
          </div>
        </div>

        {sim.currentDriverId ? (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Current Assignment</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{sim.currentDriverId.fullName}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              {sim.currentDriverId.employeeCode} · Since {formatDate(sim.assignedSince)}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>Not currently assigned</div>
        )}

        <SectionHeader title="Assignment History" />
        {history.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>No assignments yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map((a) => (
              <div key={a._id} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 500 }}>{a.driverName || a.driverId?.fullName}</span>
                  <StatusBadge status={a.status} />
                </div>
                <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>
                  {formatDate(a.assignedDate)} → {a.returnedDate ? formatDate(a.returnedDate) : 'present'}
                </div>
              </div>
            ))}
          </div>
        )}

        <SectionHeader title="Recent Bills" />
        {bills.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>No bills imported yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bills.map((b) => (
              <div key={b._id} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{b.invoiceNumber || 'No invoice #'}</span>
                  <span style={{ fontWeight: 600 }}>AED {n(b.totalAmount)}</span>
                </div>
                <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>
                  {formatDate(b.billingPeriod?.startDate)} — {formatDate(b.billingPeriod?.endDate)}
                </div>
                {b.allocations?.length > 0 && (
                  <div style={{ marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                    {b.allocations.map((alloc, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        <span>{alloc.driverName} ({alloc.days}d)</span>
                        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          AED {n(alloc.amount)}
                          <StatusBadge status={alloc.status} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SidePanel>
  );
};

// ── Bills View ──
const BillsView = ({ n }) => {
  const [filters, setFilters] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, simNumber: '', status: '', isIdle: '' });
  const [selectedBill, setSelectedBill] = useState(null);
  const queryClient = useQueryClient();

  const { data: billsData, isLoading } = useQuery({
    queryKey: ['sim-bills-all', filters],
    queryFn: () => getSimBills(filters),
  });
  const bills = billsData?.data || [];

  const handleWaive = async (billId, idx) => {
    try {
      await waiveBillAllocation(billId, idx);
      toast.success('Allocation waived');
      queryClient.invalidateQueries({ queryKey: ['sim-bills-all'] });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to waive');
    }
  };

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>Year</label>
          <select style={{ ...inputStyle, width: 100 }} value={filters.year} onChange={(e) => setFilters(f => ({ ...f, year: Number(e.target.value) }))}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Month</label>
          <select style={{ ...inputStyle, width: 100 }} value={filters.month} onChange={(e) => setFilters(f => ({ ...f, month: Number(e.target.value) }))}>
            {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>SIM Number</label>
          <input style={{ ...inputStyle, width: 140 }} placeholder="Search..." value={filters.simNumber} onChange={(e) => setFilters(f => ({ ...f, simNumber: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <select style={{ ...inputStyle, width: 120 }} value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="allocated">Allocated</option>
            <option value="deducted">Deducted</option>
            <option value="waived">Waived</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Idle Only</label>
          <select style={{ ...inputStyle, width: 80 }} value={filters.isIdle} onChange={(e) => setFilters(f => ({ ...f, isIdle: e.target.value }))}>
            <option value="">No</option>
            <option value="true">Yes</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading bills...</div>
      ) : bills.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, opacity: 0.4, marginBottom: 8 }}>&#128196;</div>
          <div style={{ fontSize: 13 }}>No bills found for this period</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Invoice #', 'SIM Number', 'Period', 'Service', 'Usage', 'VAT', 'Total', 'Idle', 'Allocations'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b._id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setSelectedBill(b)}>
                  <td style={{ padding: '8px 6px' }}>{b.invoiceNumber || '—'}</td>
                  <td style={{ padding: '8px 6px', fontFamily: 'var(--mono)' }}>{b.simNumber}</td>
                  <td style={{ padding: '8px 6px' }}>{formatDate(b.billingPeriod?.startDate)}</td>
                  <td style={{ padding: '8px 6px' }}>{n(b.serviceRentals)}</td>
                  <td style={{ padding: '8px 6px' }}>{n(b.usageCharges)}</td>
                  <td style={{ padding: '8px 6px' }}>{n(b.vatAmount)}</td>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>AED {n(b.totalAmount)}</td>
                  <td style={{ padding: '8px 6px' }}>{b.isIdleBill ? <span style={{ color: '#f87171' }}>Yes</span> : '—'}</td>
                  <td style={{ padding: '8px 6px' }}>{b.allocations?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedBill && (
        <Modal title={`Bill ${selectedBill.invoiceNumber || selectedBill.simNumber}`} onClose={() => setSelectedBill(null)} width={540}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
              <div><span style={{ color: 'var(--text3)' }}>SIM:</span> {selectedBill.simNumber}</div>
              <div><span style={{ color: 'var(--text3)' }}>Total:</span> AED {n(selectedBill.totalAmount)}</div>
              <div><span style={{ color: 'var(--text3)' }}>Period:</span> {formatDate(selectedBill.billingPeriod?.startDate)} — {formatDate(selectedBill.billingPeriod?.endDate)}</div>
              <div><span style={{ color: 'var(--text3)' }}>Idle:</span> {selectedBill.isIdleBill ? 'Yes' : 'No'}</div>
            </div>
            <SectionHeader title="Allocations" />
            {(!selectedBill.allocations || selectedBill.allocations.length === 0) ? (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>No allocations</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedBill.allocations.map((alloc, idx) => (
                  <div key={idx} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span><strong>{alloc.driverName}</strong> ({alloc.driverCode})</span>
                      <StatusBadge status={alloc.status} />
                    </div>
                    <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>
                      {formatDate(alloc.fromDate)} — {formatDate(alloc.toDate)} · {alloc.days} days · AED {n(alloc.amount)}
                    </div>
                    {alloc.status !== 'waived' && alloc.status !== 'deducted' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleWaive(selectedBill._id, idx); }}
                        style={{ marginTop: 4, background: 'none', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer', padding: 0 }}
                      >
                        Waive
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Main SimCards Page ──
const SimCards = () => {
  const queryClient = useQueryClient();
  const { n } = useFormatters();
  const { isMobile } = useBreakpoint();
  const canCreate = usePermission('simcards.create');
  const canAssign = usePermission('simcards.assign');
  const canBulkImport = usePermission('simcards.bulk_import');
  const canImport = usePermission('simcards.import_bills');
  const canViewBills = usePermission('simcards.view_bills');

  const [view, setView] = useState('sims');
  const [showAddModal, setShowAddModal] = useState(false);
  const [assignModal, setAssignModal] = useState(null);
  const [returnModal, setReturnModal] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [bulkImportModal, setBulkImportModal] = useState(false);
  const [detailSim, setDetailSim] = useState(null);
  const [filters, setFilters] = useState({ search: '', status: '', operator: '', assignment: '' });

  const { data: summaryData } = useQuery({
    queryKey: ['sim-summary'],
    queryFn: getSimSummary,
  });
  const summary = summaryData?.data;

  const { data: simsData, isLoading } = useQuery({
    queryKey: ['simcards', filters],
    queryFn: () => getSimCards(filters),
    keepPreviousData: true,
  });
  const sims = simsData?.data || [];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['simcards'] });
    queryClient.invalidateQueries({ queryKey: ['sim-summary'] });
    queryClient.invalidateQueries({ queryKey: ['sim-bills-all'] });
  };

  return (
    <div style={{ padding: 24, color: 'var(--text)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--sans)', fontSize: 20, fontWeight: 500, margin: 0 }}>SIM cards</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={tabPill(view === 'sims')} onClick={() => setView('sims')}>SIM Cards</button>
          {canViewBills && <button type="button" style={tabPill(view === 'bills')} onClick={() => setView('bills')}>Bills</button>}
        </div>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
          <KpiCard label="Total SIM Cards" value={summary.totalSims} />
          <KpiCard label="Allocated SIMs" value={summary.allocatedSims} color="#4ade80" />
          <KpiCard label="Idle SIMs" value={summary.idleSims} color="#fbbf24" />
          <KpiCard label="Last Month Total Bill" value={summary.lastMonth?.totalBill} sub={`AED · ${summary.lastMonth?.billCount || 0} bills`} />
          <KpiCard label="Charged to Drivers" value={summary.lastMonth?.chargedToDrivers} color="#4ade80" sub="AED" />
          <KpiCard label="Idle Bill" value={summary.lastMonth?.idleBill} color="#f87171" sub="AED" />
        </div>
      )}

      {view === 'sims' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <input
                style={inputStyle}
                placeholder="Search by SIM number or driver name..."
                value={filters.search}
                onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
              />
            </div>
            <select style={{ ...inputStyle, width: 120 }} value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="idle">Idle</option>
              <option value="suspended">Suspended</option>
              <option value="terminated">Terminated</option>
            </select>
            <select style={{ ...inputStyle, width: 120 }} value={filters.operator} onChange={(e) => setFilters(f => ({ ...f, operator: e.target.value }))}>
              <option value="">All Operators</option>
              <option value="Etisalat">Etisalat</option>
              <option value="Du">Du</option>
              <option value="Virgin">Virgin</option>
            </select>
            <select style={{ ...inputStyle, width: 130 }} value={filters.assignment} onChange={(e) => setFilters(f => ({ ...f, assignment: e.target.value }))}>
              <option value="">All Assignment</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
            <div style={{ display: 'flex', gap: 6 }}>
              {canCreate && <Btn onClick={() => setShowAddModal(true)}>+ Add SIM</Btn>}
              {canBulkImport && <Btn variant="ghost" onClick={() => setBulkImportModal(true)}>Bulk Import</Btn>}
              {canImport && <Btn variant="ghost" onClick={() => setImportModal(true)}>Import Bills</Btn>}
            </div>
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading...</div>
          ) : sims.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>&#9678;</div>
              <div style={{ fontSize: 14 }}>No SIM cards found</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Try adjusting the filters or add a new SIM card</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['SIM Number', 'Operator', 'Plan Cost', 'Status', 'Assigned Driver', 'Assigned Since', 'Actions'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sims.map((sim) => (
                    <tr
                      key={sim._id}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => setDetailSim(sim)}
                    >
                      <td style={{ padding: '8px 6px', fontFamily: 'var(--mono)', fontWeight: 500 }}>{sim.simNumber}</td>
                      <td style={{ padding: '8px 6px' }}>{sim.operator}</td>
                      <td style={{ padding: '8px 6px' }}>AED {n(sim.monthlyPlanCost || 0)}</td>
                      <td style={{ padding: '8px 6px' }}><StatusBadge status={sim.status} /></td>
                      <td style={{ padding: '8px 6px' }}>{sim.currentDriverId?.fullName || <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                      <td style={{ padding: '8px 6px' }}>{formatDate(sim.assignedSince)}</td>
                      <td style={{ padding: '8px 6px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {canAssign && !sim.currentDriverId && (
                            <button onClick={() => setAssignModal(sim)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', padding: '2px 6px' }}>
                              Assign
                            </button>
                          )}
                          {canAssign && sim.currentDriverId && (
                            <button onClick={() => setReturnModal(sim)} style={{ background: 'none', border: 'none', color: '#fbbf24', fontSize: 11, cursor: 'pointer', padding: '2px 6px' }}>
                              Return
                            </button>
                          )}
                          <button onClick={() => setDetailSim(sim)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 11, cursor: 'pointer', padding: '2px 6px' }}>
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <BillsView n={n} />
      )}

      {showAddModal && (
        <AddSimModal onClose={() => setShowAddModal(false)} onSaved={() => { setShowAddModal(false); invalidateAll(); }} />
      )}
      {assignModal && (
        <AssignSimModal sim={assignModal} onClose={() => setAssignModal(null)} onSaved={() => { setAssignModal(null); invalidateAll(); }} />
      )}
      {returnModal && (
        <ReturnSimModal sim={returnModal} onClose={() => setReturnModal(null)} onSaved={() => { setReturnModal(null); invalidateAll(); }} />
      )}
      {bulkImportModal && (
        <BulkImportSimModal onClose={() => setBulkImportModal(false)} onSaved={() => invalidateAll()} />
      )}
      {importModal && (
        <ImportBillsModal onClose={() => setImportModal(false)} onSaved={() => invalidateAll()} />
      )}
      {detailSim && (
        <SimDetailPanel simId={detailSim._id} onClose={() => setDetailSim(null)} />
      )}
    </div>
  );
};

export default SimCards;
