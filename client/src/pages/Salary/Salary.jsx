import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import PermissionGate from '../../components/ui/PermissionGate';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import SidePanel from '../../components/ui/SidePanel';
import ClientSelect from '../../components/ui/ClientSelect';
import { useNavigate } from 'react-router-dom';
import { getRuns, runPayroll, approveRun, getWpsFile } from '../../api/salaryApi';
import { formatDate, formatCurrencyFull } from '../../utils/formatters';
import Pagination from '../../components/ui/Pagination';

const fallbackRuns = [
  { _id: 'SAL-001', client: 'Amazon UAE', period: 'Mar 2026', status: 'draft', totalGross: 856200, totalDeductions: 124800, totalNet: 731400, driverCount: 342, createdAt: '2026-03-21T08:00:00Z', approvedBy: null },
  { _id: 'SAL-002', client: 'Noon', period: 'Mar 2026', status: 'approved', totalGross: 534000, totalDeductions: 78500, totalNet: 455500, driverCount: 218, createdAt: '2026-03-20T14:00:00Z', approvedBy: 'Finance Manager' },
  { _id: 'SAL-003', client: 'Talabat', period: 'Mar 2026', status: 'approved', totalGross: 374400, totalDeductions: 52100, totalNet: 322300, driverCount: 156, createdAt: '2026-03-19T10:30:00Z', approvedBy: 'Finance Manager' },
  { _id: 'SAL-004', client: 'Amazon UAE', period: 'Feb 2026', status: 'paid', totalGross: 849000, totalDeductions: 121500, totalNet: 727500, driverCount: 340, createdAt: '2026-02-20T08:00:00Z', approvedBy: 'Finance Manager' },
  { _id: 'SAL-005', client: 'Noon', period: 'Feb 2026', status: 'paid', totalGross: 527000, totalDeductions: 76200, totalNet: 450800, driverCount: 215, createdAt: '2026-02-19T09:00:00Z', approvedBy: 'Finance Manager' },
];

const statusMap = {
  draft: { label: 'Draft', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  paid: { label: 'Paid', variant: 'info' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
};

const Salary = () => {
  const [showRunModal, setShowRunModal] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['salary-runs', { status: statusFilter, page }],
    queryFn: () => getRuns({ status: statusFilter !== 'all' ? statusFilter : undefined, page, limit: 20 }),
    retry: 1,
  });

  const runs = data?.data || fallbackRuns;
  const pagination = data?.pagination;
  const filtered = runs;

  const totalGross = runs.reduce((s, r) => s + (r.totalGross || 0), 0);
  const totalNet = runs.reduce((s, r) => s + (r.totalNet || 0), 0);
  const draftCount = runs.filter((r) => r.status === 'draft').length;

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total runs" value={runs.length} />
        <KpiCard label="Gross payroll" value={formatCurrencyFull(totalGross)} />
        <KpiCard label="Net payout" value={formatCurrencyFull(totalNet)} color="#4ade80" />
        <KpiCard label="Pending approval" value={draftCount} color={draftCount > 0 ? '#fbbf24' : '#4ade80'} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ width: 180, height: 34 }}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <PermissionGate permission="salary.run">
              <Btn small variant="primary" onClick={() => setShowRunModal(true)}>Run payroll</Btn>
            </PermissionGate>
          </div>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No salary runs" message="Run a payroll to get started." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {['Run ID', 'Client', 'Period', 'Drivers', 'Gross', 'Deductions', 'Net', 'Status', 'Created'].map((h) => (
                    <th key={h} style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', background: 'var(--surface2)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const st = statusMap[r.status] || statusMap.draft;
                  return (
                    <tr
                      key={r._id}
                      onClick={() => setSelectedRun(r)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{r._id}</span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{r.client}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{r.period}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.driverCount}</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{formatCurrencyFull(r.totalGross)}</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#f87171' }}>{formatCurrencyFull(r.totalDeductions)}</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#4ade80' }}>{formatCurrencyFull(r.totalNet)}</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}><Badge variant={st.variant}>{st.label}</Badge></td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--text3)' }}>{formatDate(r.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={pagination?.pages || 1}
          total={pagination?.total ?? runs.length}
          pageSize={pagination?.limit || 20}
          onPageChange={setPage}
        />
      </div>

      {selectedRun && <RunDetail run={selectedRun} onClose={() => setSelectedRun(null)} />}
      {showRunModal && <RunPayrollModal onClose={() => setShowRunModal(false)} />}
    </div>
  );
};

const RunDetail = ({ run, onClose }) => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const st = statusMap[run.status] || statusMap.draft;

  const { mutate: approve, isLoading: approving } = useMutation({
    mutationFn: () => approveRun(run._id),
    onSuccess: () => {
      toast.success('Payroll run approved');
      qc.invalidateQueries(['salary-runs']);
      onClose();
    },
    onError: () => toast.error('Failed to approve run'),
  });

  const handleWpsDownload = async () => {
    try {
      const year = run.period?.year || new Date().getFullYear();
      const month = run.period?.month || (new Date().getMonth() + 1);
      const blob = await getWpsFile({ year, month, clientId: run.clientId });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `WPS_${run.client || run.clientName}_${year}_${month}.sif`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('WPS file downloaded');
    } catch {
      toast.error('Failed to download WPS file');
    }
  };

  return (
    <SidePanel onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Payroll {run._id}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{run.client} &middot; {run.period}</div>
        </div>
        <button onClick={onClose} style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 16 }}>&times;</button>
      </div>
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <InfoRow label="Status" value={<Badge variant={st.variant}>{st.label}</Badge>} />
          <InfoRow label="Drivers" value={run.driverCount} />
          <InfoRow label="Gross payroll" value={formatCurrencyFull(run.totalGross)} />
          <InfoRow label="Total deductions" value={formatCurrencyFull(run.totalDeductions)} />
          <InfoRow label="Net payout" value={<span style={{ color: '#4ade80' }}>{formatCurrencyFull(run.totalNet)}</span>} />
          <InfoRow label="Created" value={formatDate(run.createdAt)} />
          {run.approvedBy && <InfoRow label="Approved by" value={run.approvedBy} />}
        </div>

        {run.deductions && run.deductions.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: 'var(--text2)' }}>Deductions breakdown</div>
            {run.deductions.map((ded, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <div>
                  <div style={{ color: 'var(--text)' }}>{ded.description || ded.type}</div>
                  {ded.type === 'vehicle_rental' && run.vehiclePlate && (
                    <div
                      onClick={() => navigate(`/vehicles?plate=${encodeURIComponent(run.vehiclePlate)}`)}
                      style={{
                        fontSize: 10,
                        fontFamily: 'var(--mono)',
                        color: 'var(--text3)',
                        marginTop: 2,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      {run.vehiclePlate} <span style={{ fontSize: 9 }}>↗</span>
                    </div>
                  )}
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#f87171' }}>
                  {formatCurrencyFull(ded.amount)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <PermissionGate permission="salary.approve">
            {run.status === 'draft' && (
              <Btn variant="primary" onClick={() => approve()} disabled={approving}>
                {approving ? 'Approving...' : 'Approve run'}
              </Btn>
            )}
          </PermissionGate>
          <PermissionGate permission="salary.export_wps">
            {(run.status === 'approved' || run.status === 'paid') && (
              <Btn variant="ghost" onClick={handleWpsDownload}>Download WPS</Btn>
            )}
          </PermissionGate>
        </div>
      </div>
    </SidePanel>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div>
  </div>
);

const RunPayrollModal = ({ onClose }) => {
  const [clientId, setClientId] = useState('');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const qc = useQueryClient();

  const { mutate: run, isLoading } = useMutation({
    mutationFn: (data) => runPayroll(data),
    onSuccess: () => {
      toast.success('Payroll run started');
      qc.invalidateQueries(['salary-runs']);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to run payroll'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!clientId) {
      toast.error('Please select a client');
      return;
    }
    run({ clientId, year: Number(year), month: Number(month) });
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title="Run payroll" onClose={onClose} width={420}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Client *</label>
          <ClientSelect value={clientId} onChange={setClientId} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Year *</label>
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Month *</label>
            <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: '100%' }}>
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isLoading}>
            {isLoading ? 'Running...' : 'Run payroll'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default Salary;
