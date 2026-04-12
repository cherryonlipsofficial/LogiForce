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
import ProjectSelect from '../../components/ui/ProjectSelect';
import { useNavigate } from 'react-router-dom';
import { getRuns, runPayroll, getWpsFile, getPayslipPdf, getRun, addDeduction, deleteRun, markAsPaid, disputeRun, approveByOps, approveByCompliance, approveByAccounts, processRun, bulkApproveByOps, bulkApproveByCompliance, bulkApproveByAccounts, bulkProcess, bulkMarkAsPaid } from '../../api/salaryApi';
import { formatDate } from '../../utils/formatters';
import { useFormatters } from '../../hooks/useFormatters';
import Pagination from '../../components/ui/Pagination';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { downloadBlob } from '../../utils/downloadBlob';

const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const formatPeriod = (period) => {
  if (!period) return '—';
  if (typeof period === 'string') return period;
  if (period.year != null && period.month != null) {
    return `${monthNames[period.month - 1] || ''} ${period.year}`;
  }
  return '—';
};

const statusMap = {
  draft: { label: 'Draft', variant: 'warning' },
  ops_approved: { label: 'Ops Approved', variant: 'info' },
  compliance_approved: { label: 'Compliance Approved', variant: 'info' },
  accounts_approved: { label: 'Accounts Approved', variant: 'info' },
  processed: { label: 'Processed', variant: 'success' },
  approved: { label: 'Approved', variant: 'success' },
  paid: { label: 'Paid', variant: 'success' },
  disputed: { label: 'Disputed', variant: 'danger' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
};

const SectionHeader = ({ children, color }) => (
  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: color || 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
    {children}
  </div>
);

const BreakdownRow = ({ label, value, bold, color, sub }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
    <div>
      <div style={{ color: 'var(--text)', fontWeight: bold ? 600 : 400 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{sub}</div>}
    </div>
    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: bold ? 600 : 400, color: color || 'var(--text)' }}>
      {value}
    </span>
  </div>
);

const DEDUCTION_TYPE_LABELS = {
  telecom_sim: 'Telecom SIM',
  vehicle_rental: 'Vehicle Rental',
  salik: 'Salik/Tolls',
  advance_recovery: 'Advance Recovery',
  penalty: 'Penalty',
  deduction_carryover: 'Carryover',
  credit_note: 'Credit Note',
  other: 'Other',
};

const APPROVAL_STAGES = [
  { key: 'ops', label: 'Operations', statusAfter: 'ops_approved', permission: 'salary.approve_ops' },
  { key: 'compliance', label: 'Compliance', statusAfter: 'compliance_approved', permission: 'salary.approve_compliance' },
  { key: 'accounts', label: 'Accounts', statusAfter: 'accounts_approved', permission: 'salary.approve_accounts' },
  { key: 'process', label: 'Processing', statusAfter: 'processed', permission: 'salary.process' },
];

const stageStatusOrder = ['draft', 'ops_approved', 'compliance_approved', 'accounts_approved', 'processed', 'paid'];

const ApprovalTracker = ({ detail }) => {
  const approvals = detail.approvals || [];
  const currentIdx = stageStatusOrder.indexOf(detail.status);

  return (
    <div style={{ marginBottom: 20 }}>
      <SectionHeader>Approval Progress</SectionHeader>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto', padding: '8px 0' }}>
        {APPROVAL_STAGES.map((stage, i) => {
          const stageApproval = approvals.find(a => a.stage === stage.key);
          const stageIdx = stageStatusOrder.indexOf(stage.statusAfter);
          const isComplete = currentIdx >= stageIdx;
          const isCurrent = currentIdx === stageIdx - 1;

          return (
            <div key={stage.key} style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 70 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 600,
                  background: isComplete ? '#4ade80' : isCurrent ? '#fbbf24' : 'var(--surface3)',
                  color: isComplete ? '#000' : isCurrent ? '#000' : 'var(--text3)',
                  border: isCurrent ? '2px solid #fbbf24' : 'none',
                  animation: isCurrent ? 'pulse 2s infinite' : 'none',
                }}>
                  {isComplete ? '\u2713' : i + 1}
                </div>
                <div style={{ fontSize: 10, fontWeight: 500, marginTop: 4, textAlign: 'center', color: isComplete ? '#4ade80' : isCurrent ? '#fbbf24' : 'var(--text3)' }}>
                  {stage.label}
                </div>
                {stageApproval && (
                  <div style={{ fontSize: 9, color: 'var(--text3)', textAlign: 'center', marginTop: 2 }}>
                    {typeof stageApproval.approvedBy === 'object' ? stageApproval.approvedBy?.name : ''}
                  </div>
                )}
              </div>
              {i < APPROVAL_STAGES.length - 1 && (
                <div style={{ width: 24, height: 2, background: isComplete ? '#4ade80' : 'var(--border)', marginTop: 14, flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }`}</style>
    </div>
  );
};

const ApprovalHistory = ({ approvals }) => {
  if (!approvals || approvals.length === 0) return null;

  const stageLabels = {
    ops: 'Operations', compliance: 'Compliance', accounts: 'Accounts',
    'salary.approve_ops': 'Operations', 'salary.approve_compliance': 'Compliance', 'salary.approve_accounts': 'Accounts',
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <SectionHeader>Approval History</SectionHeader>
      {approvals.map((a) => (
        <div key={a._id || a.role} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          <div>
            <div style={{ fontWeight: 500, color: '#4ade80' }}>{stageLabels[a.stage] || a.stage} Approval</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              By {typeof a.approvedBy === 'object' ? a.approvedBy?.name : a.approvedBy || 'Unknown'}
            </div>
            {a.remarks && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, fontStyle: 'italic' }}>{a.remarks}</div>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{formatDate(a.approvedAt)}</div>
        </div>
      ))}
    </div>
  );
};

// Which roles can act on which approval stage
// Which roles can act on which approval stage
const InfoRow = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div>
  </div>
);

const ROLE_STAGE_MAP = {
  ops: ['draft'],                           // Operations approval
  compliance: ['ops_approved'],             // Compliance approval
  accountant: ['compliance_approved', 'accounts_approved', 'processed'], // Accounts approval + Process + Pay
  accounts: ['compliance_approved', 'accounts_approved', 'processed'],   // Alias for accountant
  admin: ['draft', 'ops_approved', 'compliance_approved', 'accounts_approved', 'processed'], // All stages
};

const RunDetail = ({ run, onClose }) => {
  const { isMobile } = useBreakpoint();
  const { formatCurrencyFull } = useFormatters();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role, isAdmin, hasPermission } = useAuth();
  const [viewingPdf, setViewingPdf] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingWps, setDownloadingWps] = useState(false);
  const [showDeductionForm, setShowDeductionForm] = useState(false);
  const [dedType, setDedType] = useState('telecom_sim');
  const [dedAmount, setDedAmount] = useState('');
  const [dedDesc, setDedDesc] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [confirmPay, setConfirmPay] = useState(false);
  const [deleteRemark, setDeleteRemark] = useState('');
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [showApprovalConfirm, setShowApprovalConfirm] = useState(null);

  // Fetch full run details (with all populated fields)
  const { data: fullRunData } = useQuery({
    queryKey: ['salary-run-detail', run._id],
    queryFn: () => getRun(run._id),
    retry: 1,
  });
  const detail = fullRunData?.data || run;

  // Use detail.status (fresh from API) to avoid stale button states after approval
  const currentStatus = detail?.status || run.status;
  const st = statusMap[currentStatus] || statusMap.draft;
  // Determine which stages this user's role can act on
  // If the role is explicitly mapped, restrict to those stages; otherwise fall back to all stages
  // so that custom roles with salary approval permissions can still act
  const allowedStages = isAdmin
    ? ROLE_STAGE_MAP.admin
    : (ROLE_STAGE_MAP[role] || ROLE_STAGE_MAP.admin);
  const canActOnCurrentStage = allowedStages.includes(currentStatus);

  const { mutate: submitDeduction, isPending: submittingDed } = useMutation({
    mutationFn: (data) => addDeduction(run._id, data),
    onSuccess: () => {
      toast.success('Deduction added');
      qc.invalidateQueries(['salary-runs']);
      qc.invalidateQueries(['salary-run-detail', run._id]);
      setShowDeductionForm(false);
      setDedAmount('');
      setDedDesc('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to add deduction'),
  });

  const { mutate: removeRun, isPending: deleting } = useMutation({
    mutationFn: () => deleteRun(run._id, currentStatus === 'paid' ? { remark: deleteRemark } : undefined),
    onSuccess: () => {
      toast.success('Salary run deleted');
      qc.invalidateQueries(['salary-runs']);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete salary run'),
  });

  const { mutate: payRun, isPending: paying } = useMutation({
    mutationFn: () => markAsPaid(run._id),
    onSuccess: () => {
      toast.success('Salary run marked as paid');
      qc.invalidateQueries(['salary-runs']);
      qc.invalidateQueries(['salary-run-detail', run._id]);
      setConfirmPay(false);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to mark as paid'),
  });

  const { mutate: dispute, isPending: disputing } = useMutation({
    mutationFn: (reason) => disputeRun(run._id, reason),
    onSuccess: () => {
      toast.success('Salary run disputed');
      qc.invalidateQueries(['salary-runs']);
      qc.invalidateQueries(['salary-run-detail', run._id]);
      setShowDisputeForm(false);
      setDisputeReason('');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to dispute salary run'),
  });

  const invalidateAll = () => {
    qc.invalidateQueries(['salary-runs']);
    qc.invalidateQueries(['salary-run-detail', run._id]);
  };

  const { mutate: opsApprove, isPending: opsApproving } = useMutation({
    mutationFn: (data) => approveByOps(run._id, data),
    onSuccess: () => { toast.success('Approved by Operations'); invalidateAll(); setShowApprovalConfirm(null); setApprovalRemarks(''); onClose(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to approve'),
  });

  const { mutate: complianceApprove, isPending: complianceApproving } = useMutation({
    mutationFn: (data) => approveByCompliance(run._id, data),
    onSuccess: () => { toast.success('Approved by Compliance'); invalidateAll(); setShowApprovalConfirm(null); setApprovalRemarks(''); onClose(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to approve'),
  });

  const { mutate: accountsApprove, isPending: accountsApproving } = useMutation({
    mutationFn: (data) => approveByAccounts(run._id, data),
    onSuccess: () => { toast.success('Approved by Accounts'); invalidateAll(); setShowApprovalConfirm(null); setApprovalRemarks(''); onClose(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to approve'),
  });

  const { mutate: processMut, isPending: processing } = useMutation({
    mutationFn: () => processRun(run._id),
    onSuccess: () => { toast.success('Salary run processed'); invalidateAll(); onClose(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to process'),
  });

  const stageApproving = opsApproving || complianceApproving || accountsApproving;

  const handleWpsDownload = async () => {
    setDownloadingWps(true);
    try {
      const year = run.period?.year || new Date().getFullYear();
      const month = run.period?.month || (new Date().getMonth() + 1);
      const blob = await getWpsFile({ year, month, clientId: run.clientId });
      downloadBlob(blob, `WPS_${run.projectId?.name || 'export'}_${year}_${month}.sif`);
      toast.success('WPS file downloaded');
    } catch {
      toast.error('Failed to download WPS file');
    } finally {
      setDownloadingWps(false);
    }
  };

  const handleViewPayslip = async () => {
    setViewingPdf(true);
    try {
      const blob = await getPayslipPdf(run._id);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch {
      toast.error('Failed to load payslip');
    } finally {
      setViewingPdf(false);
    }
  };

  const handleDownloadPayslip = async () => {
    setDownloadingPdf(true);
    try {
      const blob = await getPayslipPdf(run._id);
      const driverName = (detail.driverId?.fullName || 'driver').replace(/\s+/g, '_');
      const period = detail.period ? `${detail.period.year}_${String(detail.period.month).padStart(2, '0')}` : '';
      downloadBlob(blob, `Payslip_${driverName}_${period}.pdf`);
      toast.success('Payslip downloaded');
    } catch {
      toast.error('Failed to download payslip');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Calculate totals from detail data
  const totalAllowances = (detail.allowances || []).reduce((s, a) => s + (a.amount || 0), 0);

  return (
    <SidePanel onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Payroll {detail.runId || run._id}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{detail.projectId?.name || '—'} &middot; {formatPeriod(detail.period)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge variant={st.variant}>{st.label}</Badge>
          <button onClick={onClose} style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 16 }}>&times;</button>
        </div>
      </div>
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        {/* Employee Info */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 20 }}>
          <InfoRow label="Driver" value={detail.driverId?.fullName || '—'} />
          <InfoRow label="Employee Code" value={detail.driverId?.employeeCode || '—'} />
          <InfoRow label="Pay Structure" value={(detail.driverId?.payStructure || '—').replace(/_/g, ' ')} />
          <InfoRow label="Working Days" value={detail.workingDays ?? '—'} />
          <InfoRow label="Overtime Hours" value={detail.overtimeHours ?? 0} />
          <InfoRow label="Total Orders" value={detail.totalOrders ?? 0} />
          <InfoRow label="Created" value={formatDate(detail.createdAt)} />
          {detail.projectId?.salaryReleaseDay && <InfoRow label="Salary Release Date" value={`${detail.projectId.salaryReleaseDay}th of every month`} />}
          {detail.processedBy && <InfoRow label="Processed by" value={typeof detail.processedBy === 'object' ? detail.processedBy.name : detail.processedBy} />}
          {detail.processedAt && <InfoRow label="Processed on" value={formatDate(detail.processedAt)} />}
          {detail.paidAt && <InfoRow label="Paid on" value={formatDate(detail.paidAt)} />}
        </div>

        {/* Offboarding Clearance banner — shown when driver is resigned/offboarded */}
        {['resigned', 'offboarded'].includes(detail.driverId?.status) && (
          <div style={{
            marginBottom: 16,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid',
            borderColor: detail.clearanceRef?.overallStatus === 'completed' ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)',
            background: detail.clearanceRef?.overallStatus === 'completed' ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
            fontSize: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                  Offboarding clearance {detail.clearanceRef?.overallStatus === 'completed' ? 'completed' : 'required'}
                </div>
                <div style={{ color: 'var(--text3)', marginTop: 2 }}>
                  {detail.clearanceRef
                    ? `Clearance ${detail.clearanceRef.clearanceNo} — status: ${detail.clearanceRef.overallStatus?.replace('_', ' ')}. Salary cannot be processed until client, supplier, and internal clearances are all logged.`
                    : 'Driver is resigned/offboarded. A clearance record must exist and be completed before final salary can be processed.'}
                </div>
              </div>
              <Btn small onClick={() => navigate('/driver-clearance')}>Open clearance</Btn>
            </div>
          </div>
        )}

        {/* Approval Progress Tracker */}
        <ApprovalTracker detail={detail} />

        {/* Earnings Breakdown */}
        <div style={{ marginBottom: 20 }}>
          <SectionHeader color="#4ade80">Earnings</SectionHeader>
          <BreakdownRow label="Base Salary" value={formatCurrencyFull(detail.baseSalary)} />
          <BreakdownRow label="Prorated Salary" value={formatCurrencyFull(detail.proratedSalary)} sub={detail.driverId?.payStructure === 'PER_ORDER' ? `Based on ${detail.totalOrders ?? 0} orders` : `Based on ${detail.workingDays ?? 0} working days`} />
          {(detail.overtimePay > 0) && (
            <BreakdownRow label="Overtime Pay" value={formatCurrencyFull(detail.overtimePay)} sub={`${detail.overtimeHours ?? 0} hours @ 1.25x rate`} />
          )}
          {(detail.allowances || []).map((a) => (
            <BreakdownRow
              key={a.type || a.label}
              label={`${(a.type || 'Allowance').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())} Allowance`}
              value={formatCurrencyFull(a.amount)}
            />
          ))}
          <BreakdownRow label="Gross Salary" value={formatCurrencyFull(detail.grossSalary)} bold color="#4ade80" />
        </div>

        {/* Deductions Breakdown */}
        <div style={{ marginBottom: 20 }}>
          <SectionHeader color="#f87171">Deductions</SectionHeader>
          {(detail.deductions && detail.deductions.length > 0) ? (
            <>
              {detail.deductions.filter(d => d.amount > 0).map((ded) => (
                <div key={ded.type || ded.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <div>
                    <div style={{ color: 'var(--text)' }}>{ded.description || ded.type?.replace(/_/g, ' ')}</div>
                    {ded.type === 'vehicle_rental' && run.vehiclePlate && (
                      <div
                        onClick={() => navigate(`/vehicles?plate=${encodeURIComponent(run.vehiclePlate)}`)}
                        style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                      >
                        {run.vehiclePlate} <span style={{ fontSize: 9 }}>&#8599;</span>
                      </div>
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#f87171' }}>
                    {formatCurrencyFull(ded.amount)}
                  </span>
                </div>
              ))}
              <BreakdownRow label="Total Deductions" value={formatCurrencyFull(detail.totalDeductions)} bold color="#f87171" />
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>No deductions</div>
          )}
        </div>

        {/* Net Salary Highlight */}
        {(() => {
          const hasNegativeBalance = detail.deductionCarryover > 0 || (detail.netSalary === 0 && detail.totalDeductions > detail.grossSalary);
          const accentColor = hasNegativeBalance ? '#f87171' : '#4ade80';
          return (
            <>
              <div style={{
                background: hasNegativeBalance
                  ? 'linear-gradient(135deg, rgba(248,113,113,0.1), rgba(248,113,113,0.05))'
                  : 'linear-gradient(135deg, rgba(74,222,128,0.1), rgba(74,222,128,0.05))',
                border: `1px solid ${hasNegativeBalance ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}`,
                borderRadius: 10,
                padding: '14px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: hasNegativeBalance ? 10 : 20,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Net Salary</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: accentColor, fontFamily: 'var(--mono)' }}>
                  {formatCurrencyFull(detail.netSalary)}
                </div>
              </div>
              {hasNegativeBalance && (
                <div style={{
                  background: 'rgba(248,113,113,0.08)',
                  border: '1px solid rgba(248,113,113,0.25)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}>
                  <span style={{ fontSize: 16, lineHeight: 1 }}>&#9888;</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#f87171', marginBottom: 2 }}>Negative Balance</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                      Deductions exceed gross salary by <strong style={{ color: '#f87171', fontFamily: 'var(--mono)' }}>{formatCurrencyFull(detail.deductionCarryover || (detail.totalDeductions - detail.grossSalary))}</strong>.
                      This amount will be auto-adjusted in the next month's draft salary.
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* Notes */}
        {detail.notes && (
          <div style={{ marginBottom: 20, padding: '10px 14px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#fbbf24', marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{detail.notes}</div>
          </div>
        )}

        {/* Approval History */}
        <ApprovalHistory approvals={detail.approvals} />

        {/* Add Deduction Form (draft, ops_approved, compliance_approved) */}
        {['draft', 'ops_approved', 'compliance_approved'].includes(currentStatus) && (
          <PermissionGate permission="salary.manage_deductions">
            <div style={{ marginBottom: 20 }}>
              {!showDeductionForm ? (
                <Btn small variant="ghost" onClick={() => setShowDeductionForm(true)}>+ Add deduction</Btn>
              ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 10, color: 'var(--text2)' }}>Add manual deduction</div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Type</label>
                    <select value={dedType} onChange={(e) => setDedType(e.target.value)} style={{ width: '100%', height: 32, fontSize: 12 }}>
                      {Object.entries(DEDUCTION_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Amount (AED)</label>
                    <input type="number" step="0.01" min="0.01" value={dedAmount} onChange={(e) => setDedAmount(e.target.value)} placeholder="0.00" style={{ width: '100%', height: 32, fontSize: 12 }} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Description (optional)</label>
                    <input type="text" value={dedDesc} onChange={(e) => setDedDesc(e.target.value)} placeholder="e.g. March SIM charge" style={{ width: '100%', height: 32, fontSize: 12 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn small variant="primary" disabled={submittingDed || !dedAmount} onClick={() => submitDeduction({ type: dedType, amount: parseFloat(dedAmount), description: dedDesc || undefined })}>
                      {submittingDed ? 'Adding...' : 'Add'}
                    </Btn>
                    <Btn small variant="ghost" onClick={() => setShowDeductionForm(false)} disabled={submittingDed}>Cancel</Btn>
                  </div>
                </div>
              )}
            </div>
          </PermissionGate>
        )}

        {/* Dispute Form */}
        {showDisputeForm && (
          <div style={{ marginBottom: 16, border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: 14, background: 'rgba(248,113,113,0.05)' }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: '#f87171' }}>Dispute this salary run</div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Reason *</label>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Describe the reason for dispute (min 3 characters)..."
                rows={3}
                style={{ width: '100%', fontSize: 12, resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn small variant="danger" disabled={disputing || disputeReason.length < 3} onClick={() => dispute(disputeReason)}>
                {disputing ? 'Submitting...' : 'Submit Dispute'}
              </Btn>
              <Btn small variant="ghost" onClick={() => { setShowDisputeForm(false); setDisputeReason(''); }} disabled={disputing}>Cancel</Btn>
            </div>
          </div>
        )}

        {/* Approval Confirmation Form */}
        {showApprovalConfirm && (
          <div style={{ marginBottom: 16, border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: 14, background: 'rgba(74,222,128,0.05)' }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: '#4ade80' }}>{showApprovalConfirm.title}</div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Remarks (optional)</label>
              <textarea
                value={approvalRemarks}
                onChange={(e) => setApprovalRemarks(e.target.value)}
                placeholder="Add any remarks for this approval..."
                rows={2}
                style={{ width: '100%', fontSize: 12, resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn small variant="primary" disabled={stageApproving} onClick={() => showApprovalConfirm.action({ remarks: approvalRemarks || undefined })}>
                {stageApproving ? 'Submitting...' : 'Confirm'}
              </Btn>
              <Btn small variant="ghost" onClick={() => { setShowApprovalConfirm(null); setApprovalRemarks(''); }} disabled={stageApproving}>Cancel</Btn>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Stage-specific approval buttons */}
          {canActOnCurrentStage && (
            <>
              {currentStatus === 'draft' && (
                <PermissionGate permission="salary.approve_ops">
                  <Btn variant="primary" onClick={() => setShowApprovalConfirm({ title: 'Approve (Operations)', action: opsApprove })} disabled={stageApproving}>
                    Approve (Operations)
                  </Btn>
                </PermissionGate>
              )}
              {currentStatus === 'ops_approved' && (
                <PermissionGate permission="salary.approve_compliance">
                  <Btn variant="primary" onClick={() => setShowApprovalConfirm({ title: 'Approve (Compliance)', action: complianceApprove })} disabled={stageApproving}>
                    Approve (Compliance)
                  </Btn>
                </PermissionGate>
              )}
              {currentStatus === 'compliance_approved' && (
                <PermissionGate permission="salary.approve_accounts">
                  <Btn variant="primary" onClick={() => setShowApprovalConfirm({ title: 'Approve (Accounts)', action: accountsApprove })} disabled={stageApproving}>
                    Approve (Accounts)
                  </Btn>
                </PermissionGate>
              )}
            </>
          )}
          {currentStatus === 'accounts_approved' && canActOnCurrentStage && (() => {
            const needsClearance = ['resigned', 'offboarded'].includes(detail.driverId?.status);
            const clearanceBlocked = needsClearance && detail.clearanceRef?.overallStatus !== 'completed';
            return (
              <PermissionGate permission="salary.process">
                <Btn
                  variant="primary"
                  onClick={() => processMut()}
                  disabled={processing || clearanceBlocked}
                  title={clearanceBlocked ? 'Clearance must be completed before processing final salary for a resigned/offboarded driver' : undefined}
                >
                  {processing ? 'Processing...' : clearanceBlocked ? 'Process Salary (Clearance pending)' : 'Process Salary'}
                </Btn>
              </PermissionGate>
            );
          })()}
          <PermissionGate permission="salary.pay">
            {(currentStatus === 'processed' || currentStatus === 'approved') && (
              !confirmPay ? (
                <Btn variant="primary" onClick={() => setConfirmPay(true)}>Mark as Paid</Btn>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#4ade80' }}>Confirm payment?</span>
                  <Btn variant="primary" small onClick={() => payRun()} disabled={paying}>
                    {paying ? 'Processing...' : 'Yes, mark paid'}
                  </Btn>
                  <Btn variant="ghost" small onClick={() => setConfirmPay(false)} disabled={paying}>Cancel</Btn>
                </div>
              )
            )}
          </PermissionGate>
          <PermissionGate permission="salary.dispute">
            {currentStatus !== 'paid' && currentStatus !== 'disputed' && !showDisputeForm && (
              <Btn variant="danger" onClick={() => setShowDisputeForm(true)}>Dispute</Btn>
            )}
          </PermissionGate>
          <PermissionGate permission="salary.export_wps">
            {(['approved', 'processed', 'paid'].includes(currentStatus)) && (
              <Btn variant="ghost" onClick={handleWpsDownload} disabled={downloadingWps}>
                {downloadingWps ? 'Downloading...' : 'Download WPS'}
              </Btn>
            )}
          </PermissionGate>
          {currentStatus === 'paid' && (
            <PermissionGate permission="salary.view">
              <Btn variant="ghost" onClick={handleViewPayslip} disabled={viewingPdf}>
                {viewingPdf ? 'Loading...' : 'View Payslip'}
              </Btn>
              <Btn variant="primary" onClick={handleDownloadPayslip} disabled={downloadingPdf}>
                {downloadingPdf ? 'Downloading...' : 'Download Payslip PDF'}
              </Btn>
            </PermissionGate>
          )}
          <PermissionGate permission="salary.delete">
            {!confirmDelete ? (
              <Btn variant="danger" small onClick={() => setConfirmDelete(true)}>Delete</Btn>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                {currentStatus === 'paid' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: '#f87171', marginBottom: 4 }}>Remark (required for paid salary runs)</label>
                    <input
                      type="text"
                      value={deleteRemark}
                      onChange={(e) => setDeleteRemark(e.target.value)}
                      placeholder="Reason for deleting this paid salary run..."
                      style={{ width: '100%', fontSize: 12 }}
                    />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#f87171' }}>Are you sure?</span>
                  <Btn variant="danger" small onClick={() => removeRun()} disabled={deleting || (currentStatus === 'paid' && deleteRemark.trim().length < 3)}>
                    {deleting ? 'Deleting...' : 'Yes, delete'}
                  </Btn>
                  <Btn variant="ghost" small onClick={() => { setConfirmDelete(false); setDeleteRemark(''); }} disabled={deleting}>Cancel</Btn>
                </div>
              </div>
            )}
          </PermissionGate>
        </div>
      </div>
    </SidePanel>
  );
};

const RunPayrollModal = ({ onClose }) => {
  const { isMobile } = useBreakpoint();
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const qc = useQueryClient();

  const { mutate: run, isPending: isLoading } = useMutation({
    mutationFn: (data) => runPayroll(data),
    onSuccess: (res) => {
      const result = res?.data || {};
      const errors = result.errors || [];
      const runs = result.runs || [];
      qc.invalidateQueries(['salary-runs']);
      if (errors.length > 0 && runs.length === 0) {
        toast.error(`Payroll run failed with ${errors.length} error(s): ${errors[0]?.error || 'Unknown error'}`);
      } else if (errors.length > 0) {
        toast.success(`Payroll completed: ${runs.length} driver(s) processed`);
        toast.error(`${errors.length} driver(s) had errors`);
        onClose();
      } else {
        toast.success(`Payroll completed: ${result.totalDrivers || 0} driver(s) processed`);
        onClose();
      }
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to run payroll'),
  });

  const handleClientChange = (val) => {
    setClientId(val);
    setProjectId('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!clientId) {
      toast.error('Please select a client');
      return;
    }
    if (!projectId) {
      toast.error('Please select a project');
      return;
    }
    run({ clientId, projectId, year: Number(year), month: Number(month) });
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title="Run payroll" onClose={isLoading ? undefined : onClose} width={420}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Client *</label>
          <ClientSelect value={clientId} onChange={handleClientChange} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Project *</label>
          <ProjectSelect value={projectId} onChange={setProjectId} clientId={clientId} disabled={!clientId} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
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
          <Btn variant="ghost" onClick={onClose} disabled={isLoading}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isLoading}>
            {isLoading ? 'Running...' : 'Run payroll'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

// Determine the bulk action available for a given status
const getBulkActionForStatus = (status) => {
  switch (status) {
    case 'draft': return { label: 'Approve (Operations)', key: 'ops' };
    case 'ops_approved': return { label: 'Approve (Compliance)', key: 'compliance' };
    case 'compliance_approved': return { label: 'Approve (Accounts)', key: 'accounts' };
    case 'accounts_approved': return { label: 'Process', key: 'process' };
    case 'processed': return { label: 'Mark as Paid', key: 'pay' };
    default: return null;
  }
};

const Salary = () => {
  const { isMobile, isTablet } = useBreakpoint();
  const { formatCurrencyFull } = useFormatters();
  const [showRunModal, setShowRunModal] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [driverSearch, setDriverSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkRemarks, setBulkRemarks] = useState('');
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const { role, isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['salary-runs', { status: statusFilter, page }],
    queryFn: () => getRuns({ status: statusFilter !== 'all' ? statusFilter : undefined, page, limit: 20 }),
    retry: 1,
  });

  const runs = data?.data || [];
  const pagination = data?.pagination;
  const filtered = driverSearch.trim()
    ? runs.filter((r) => (r.driverId?.fullName || '').toLowerCase().includes(driverSearch.trim().toLowerCase()))
    : runs;

  const totalGross = runs.reduce((s, r) => s + (r.grossSalary || 0), 0);
  const totalNet = runs.reduce((s, r) => s + (r.netSalary || 0), 0);
  const draftCount = runs.filter((r) => !['processed', 'paid'].includes(r.status)).length;

  // Determine which statuses this user's role can act on
  const allowedStages = isAdmin ? ROLE_STAGE_MAP.admin : (ROLE_STAGE_MAP[role] || ROLE_STAGE_MAP.admin);

  // Filter selectable runs: only those the user can act on at their current status
  const selectableRuns = filtered.filter((r) => allowedStages.includes(r.status) && getBulkActionForStatus(r.status));

  const toggleSelect = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === selectableRuns.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableRuns.map((r) => r._id));
    }
  };

  // Clear selection when filters/page change
  const handleFilterChange = (val) => { setStatusFilter(val); setPage(1); setSelectedIds([]); };
  const handlePageChange = (p) => { setPage(p); setSelectedIds([]); };

  // Determine common bulk action (all selected must share the same status for a clean UX)
  const selectedRuns = filtered.filter((r) => selectedIds.includes(r._id));
  const selectedStatuses = [...new Set(selectedRuns.map((r) => r.status))];
  const bulkAction = selectedStatuses.length === 1 ? getBulkActionForStatus(selectedStatuses[0]) : null;

  const { mutate: executeBulkAction, isPending: bulkPending } = useMutation({
    mutationFn: ({ key, runIds, remarks }) => {
      switch (key) {
        case 'ops': return bulkApproveByOps({ runIds, remarks });
        case 'compliance': return bulkApproveByCompliance({ runIds, remarks });
        case 'accounts': return bulkApproveByAccounts({ runIds, remarks });
        case 'process': return bulkProcess({ runIds });
        case 'pay': return bulkMarkAsPaid({ runIds });
        default: throw new Error('Unknown bulk action');
      }
    },
    onSuccess: (res) => {
      const data = res?.data || res || {};
      const approved = data.approved?.length || data.processed?.length || data.paid?.length || 0;
      const errors = data.errors?.length || 0;
      if (approved > 0) toast.success(`${approved} salary run(s) updated successfully`);
      if (errors > 0) toast.error(`${errors} salary run(s) failed`);
      qc.invalidateQueries(['salary-runs']);
      setSelectedIds([]);
      setBulkRemarks('');
      setShowBulkConfirm(false);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Bulk operation failed'),
  });

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total runs" value={runs.length} />
        <KpiCard label="Gross payroll" value={formatCurrencyFull(totalGross)} />
        <KpiCard label="Net payout" value={formatCurrencyFull(totalNet)} color="#4ade80" />
        <KpiCard label="Pending approval" value={draftCount} color={draftCount > 0 ? '#fbbf24' : '#4ade80'} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <input
            type="text"
            placeholder="Search by driver name..."
            value={driverSearch}
            onChange={(e) => { setDriverSearch(e.target.value); setPage(1); }}
            style={{ width: isMobile ? '100%' : 220, height: 34, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
          />
          <select value={statusFilter} onChange={(e) => handleFilterChange(e.target.value)} style={{ width: isMobile ? '100%' : 180, height: 34 }}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="ops_approved">Ops Approved</option>
            <option value="compliance_approved">Compliance Approved</option>
            <option value="accounts_approved">Accounts Approved</option>
            <option value="processed">Processed</option>
            <option value="paid">Paid</option>
            <option value="disputed">Disputed</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <PermissionGate permission="salary.run">
              <Btn small variant="primary" onClick={() => setShowRunModal(true)}>Run payroll</Btn>
            </PermissionGate>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.length > 0 && (
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'rgba(74,222,128,0.06)' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {selectedIds.length} selected
            </span>
            {bulkAction ? (
              !showBulkConfirm ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Btn small variant="primary" onClick={() => setShowBulkConfirm(true)}>
                    {bulkAction.label} ({selectedIds.length})
                  </Btn>
                  <Btn small variant="ghost" onClick={() => setSelectedIds([])}>Clear</Btn>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, alignItems: 'stretch', flex: 1 }}>
                  {bulkAction.key !== 'process' && bulkAction.key !== 'pay' && (
                    <input
                      type="text"
                      value={bulkRemarks}
                      onChange={(e) => setBulkRemarks(e.target.value)}
                      placeholder="Remarks (optional)"
                      style={{ flex: 1, height: 32, fontSize: 12, maxWidth: isMobile ? '100%' : 280 }}
                    />
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn small variant="primary" disabled={bulkPending} onClick={() => executeBulkAction({ key: bulkAction.key, runIds: selectedIds, remarks: bulkRemarks || undefined })}>
                      {bulkPending ? 'Processing...' : `Confirm ${bulkAction.label}`}
                    </Btn>
                    <Btn small variant="ghost" onClick={() => { setShowBulkConfirm(false); setBulkRemarks(''); }} disabled={bulkPending}>Cancel</Btn>
                  </div>
                </div>
              )
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                {selectedStatuses.length > 1 ? 'Select runs with the same status for bulk action' : 'No bulk action available for this status'}
              </span>
            )}
          </div>
        )}

        {isLoading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No salary runs" message="Run a payroll to get started." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ padding: '9px 10px', background: 'var(--surface2)', width: 36 }}>
                    {selectableRuns.length > 0 && (
                      <input
                        type="checkbox"
                        checked={selectableRuns.length > 0 && selectedIds.length === selectableRuns.length}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer', accentColor: '#4ade80' }}
                        title="Select all"
                      />
                    )}
                  </th>
                  {['Driver', 'Project', 'Period', 'Gross', 'Deductions', 'Net', 'Status', 'Created'].map((h) => (
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
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s', background: selectedIds.includes(r._id) ? 'rgba(74,222,128,0.06)' : 'transparent' }}
                      onMouseEnter={(e) => { if (!selectedIds.includes(r._id)) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                      onMouseLeave={(e) => { if (!selectedIds.includes(r._id)) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '11px 10px', width: 36 }} onClick={(e) => e.stopPropagation()}>
                        {allowedStages.includes(r.status) && getBulkActionForStatus(r.status) && (
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(r._id)}
                            onChange={() => toggleSelect(r._id)}
                            style={{ cursor: 'pointer', accentColor: '#4ade80' }}
                          />
                        )}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>
                        {r.driverId?.fullName || '—'}
                        {['resigned', 'offboarded'].includes(r.driverId?.status) && r.clearanceRef?.overallStatus !== 'completed' && (
                          <span
                            title="Offboarding clearance not completed — salary cannot be processed"
                            style={{ marginLeft: 6, fontSize: 10, background: 'rgba(245,158,11,0.15)', color: '#fbbf24', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}
                          >
                            clearance pending
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{r.projectId?.name || '—'}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{formatPeriod(r.period)}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{formatCurrencyFull(r.grossSalary)}</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#f87171' }}>{formatCurrencyFull(r.totalDeductions)}</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: (r.deductionCarryover > 0 || (r.netSalary === 0 && r.totalDeductions > 0)) ? '#f87171' : '#4ade80' }}>
                          {formatCurrencyFull(r.netSalary)}
                          {(r.deductionCarryover > 0) && (
                            <span title={`Negative balance: ${formatCurrencyFull(r.deductionCarryover)} carried to next month`} style={{ marginLeft: 4, fontSize: 10, background: 'rgba(248,113,113,0.15)', color: '#f87171', padding: '1px 5px', borderRadius: 4, fontFamily: 'inherit', fontWeight: 600 }}>
                              -{formatCurrencyFull(r.deductionCarryover)}
                            </span>
                          )}
                        </span>
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
          onPageChange={handlePageChange}
        />
      </div>

      {selectedRun && <RunDetail run={selectedRun} onClose={() => setSelectedRun(null)} />}
      {showRunModal && <RunPayrollModal onClose={() => setShowRunModal(false)} />}
    </div>
  );
};

export default Salary;
