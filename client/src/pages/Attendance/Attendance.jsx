import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import SidePanel from '../../components/ui/SidePanel';
import ClientSelect from '../../components/ui/ClientSelect';
import ProjectSelect from '../../components/ui/ProjectSelect';
import { getBatches, uploadFile, getBatch, approveBatch, rejectBatch, deleteBatch, getBatchApprovals, getBatchDisputes, runSalary } from '../../api/attendanceApi';
import { useAuth } from '../../context/AuthContext';
import PermissionGate from '../../components/ui/PermissionGate';
import { formatDate, formatRelativeTime } from '../../utils/formatters';
import Pagination from '../../components/ui/Pagination';
import ApprovalStatusCard from '../../components/attendance/ApprovalStatusCard';
import ApproveModal from '../../components/attendance/ApproveModal';
import DisputeModal from '../../components/attendance/DisputeModal';
import DisputeResponseModal from '../../components/attendance/DisputeResponseModal';
import InvoicePreviewModal from '../../components/attendance/InvoicePreviewModal';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const fallbackBatches = [
  { _id: 'ATT-001', client: 'Amazon UAE', project: 'Last Mile Delivery', projectCode: 'PRJ-00001', period: 'Mar 2026', uploadedBy: 'Sara Ali', uploadedAt: '2026-03-20T10:30:00Z', status: 'pending_review', totalRecords: 342, validRecords: 338, errors: 4, fileName: 'amazon_mar2026.csv' },
  { _id: 'ATT-002', client: 'Noon', project: 'Express Delivery', projectCode: 'PRJ-00002', period: 'Mar 2026', uploadedBy: 'Sara Ali', uploadedAt: '2026-03-19T14:15:00Z', status: 'approved', totalRecords: 218, validRecords: 218, errors: 0, fileName: 'noon_mar2026.xlsx' },
  { _id: 'ATT-003', client: 'Talabat', project: 'Food Delivery', projectCode: 'PRJ-00003', period: 'Mar 2026', uploadedBy: 'Omar K.', uploadedAt: '2026-03-18T09:00:00Z', status: 'approved', totalRecords: 156, validRecords: 154, errors: 2, fileName: 'talabat_mar2026.csv' },
  { _id: 'ATT-004', client: 'Amazon UAE', project: 'Last Mile Delivery', projectCode: 'PRJ-00001', period: 'Feb 2026', uploadedBy: 'Sara Ali', uploadedAt: '2026-02-20T11:00:00Z', status: 'approved', totalRecords: 340, validRecords: 340, errors: 0, fileName: 'amazon_feb2026.csv' },
  { _id: 'ATT-005', client: 'Noon', project: 'Express Delivery', projectCode: 'PRJ-00002', period: 'Feb 2026', uploadedBy: 'Omar K.', uploadedAt: '2026-02-19T08:45:00Z', status: 'approved', totalRecords: 215, validRecords: 212, errors: 3, fileName: 'noon_feb2026.xlsx' },
];

const statusMap = {
  uploaded: { label: 'Uploaded', variant: 'default' },
  pending_review: { label: 'Pending review', variant: 'warning' },
  pending_approval: { label: 'Pending review', variant: 'warning' },
  sales_approved: { label: 'Sales approved', variant: 'info' },
  ops_approved: { label: 'Ops approved', variant: 'info' },
  fully_approved: { label: 'Both approved ✓', variant: 'success' },
  approved: { label: 'Approved', variant: 'success' },
  disputed: { label: 'Disputed', variant: 'danger' },
  dispute_responded: { label: 'Response sent', variant: 'warning' },
  invoiced: { label: 'Invoiced', variant: 'purple' },
  rejected: { label: 'Rejected', variant: 'danger' },
  processing: { label: 'Processing', variant: 'info' },
  validating: { label: 'Validating', variant: 'info' },
  processed: { label: 'Processed', variant: 'success' },
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const normalizeBatch = (b) => {
  if (b.client && typeof b.period === 'string') return b;
  return {
    _id: b._id,
    batchId: b.batchId || b._id,
    client: b.clientId?.name || b.client || 'Unknown',
    project: b.projectId?.name || b.project || '',
    projectCode: b.projectId?.projectCode || b.projectCode || '',
    period: b.period?.year ? `${MONTHS[(b.period.month || 1) - 1]} ${b.period.year}` : b.period,
    uploadedBy: b.uploadedBy?.name || b.uploadedBy || '',
    uploadedAt: b.createdAt || b.uploadedAt,
    status: b.status === 'pending_approval' ? 'pending_review' : b.status,
    totalRecords: b.totalRows ?? b.totalRecords ?? 0,
    validRecords: b.matchedRows ?? b.validRecords ?? 0,
    errors: b.errorRows ?? b.errors ?? 0,
    fileName: b.s3Key || b.fileName || '',
    validationErrors: b.validationErrors || [],
  };
};

const dotColor = (approval) => {
  if (!approval) return 'var(--text3)';
  if (approval.status === 'approved') return '#4ade80';
  if (approval.status === 'disputed') return '#f87171';
  return 'var(--text3)';
};

const ApprovalDots = ({ batch }) => {
  const sales = batch.approvals?.find(a => a.role === 'sales');
  const ops = batch.approvals?.find(a => a.role === 'ops');
  return (
    <span style={{ display: 'inline-flex', gap: 3, marginLeft: 2 }} title="Sales / Ops approval">
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor(sales), display: 'inline-block', opacity: 0.9 }} />
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor(ops), display: 'inline-block', opacity: 0.9 }} />
    </span>
  );
};

const Attendance = () => {
  const { isMobile, isTablet } = useBreakpoint();
  const { hasPermission } = useAuth();
  const [showUpload, setShowUpload] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [clientFilter, setClientFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-batches', { clientId: clientFilter, page }],
    queryFn: () => getBatches({ clientId: clientFilter !== 'all' ? clientFilter : undefined, page, limit: 20 }),
    retry: 1,
  });

  const batches = (data?.data || fallbackBatches).map(normalizeBatch);
  const pagination = data?.pagination;

  const filtered = batches;

  const totalRecords = batches.reduce((s, b) => s + (b.totalRecords || 0), 0);
  const totalErrors = batches.reduce((s, b) => s + (b.errors || 0), 0);
  const pendingCount = batches.filter((b) => b.status === 'pending_review').length;

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total batches" value={batches.length} />
        <KpiCard label="Total records" value={totalRecords.toLocaleString()} />
        <KpiCard label="Pending review" value={pendingCount} color="#fbbf24" />
        <KpiCard label="Validation errors" value={totalErrors} color={totalErrors > 0 ? '#f87171' : '#4ade80'} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <select value={clientFilter} onChange={(e) => { setClientFilter(e.target.value); setPage(1); }} style={{ width: isMobile ? '100%' : 180, height: 34 }}>
            <option value="all">All clients</option>
            <option value="Amazon UAE">Amazon UAE</option>
            <option value="Noon">Noon</option>
            <option value="Talabat">Talabat</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <PermissionGate permission="attendance.upload">
              <Btn small variant="primary" onClick={() => setShowUpload(true)}>Upload attendance</Btn>
            </PermissionGate>
          </div>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No batches" message="Upload an attendance file to get started." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {['Batch', 'Project', 'Client', 'Period', 'Records', 'Errors', 'Status', 'Uploaded'].map((h) => (
                    <th key={h} style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', background: 'var(--surface2)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const st = statusMap[b.status] || statusMap.pending_review;
                  return (
                    <tr
                      key={b._id}
                      onClick={() => setSelectedBatch(b)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{b.batchId || b._id}</span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{b.project || b.projectCode}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{b.client}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{b.period}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{b.totalRecords}</span>
                        <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>({b.validRecords} valid)</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        {b.errors > 0 ? (
                          <Badge variant="danger">{b.errors}</Badge>
                        ) : (
                          <span style={{ color: '#4ade80', fontSize: 12 }}>0</span>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Badge variant={st.variant}>{st.label}</Badge>
                          <ApprovalDots batch={b} />
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--text3)' }}>
                        {formatDate(b.uploadedAt)}
                      </td>
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
          total={pagination?.total ?? batches.length}
          pageSize={pagination?.limit || 20}
          onPageChange={setPage}
        />
      </div>

      {selectedBatch && <BatchDetail batch={selectedBatch} onClose={() => setSelectedBatch(null)} hasPermission={hasPermission} />}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  );
};

const ISSUE_LABELS = {
  driver_not_found: 'Driver not found in system',
  invalid_working_days: 'Invalid working days value',
  zero_days: 'Working days is zero',
  over_limit: 'Working days exceeds 26',
  missing_ot: 'Missing overtime hours',
  driver_not_active: 'Driver is not active',
  visa_expired: 'Driver visa has expired',
};

const BatchDetail = ({ batch, onClose, hasPermission }) => {
  const { isMobile } = useBreakpoint();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [approveModal, setApproveModal] = useState(null);
  const [disputeModal, setDisputeModal] = useState(null);
  const [respondModal, setRespondModal] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(null);

  const { data: batchDetail } = useQuery({
    queryKey: ['batch-detail', batch?._id],
    queryFn: () => getBatch(batch._id).then(r => r.data),
    enabled: !!batch?._id,
  });

  const { data: approvalData } = useQuery({
    queryKey: ['batch-approvals', batch?._id],
    queryFn: () => getBatchApprovals(batch._id).then(r => r.data),
    enabled: !!batch?._id,
  });

  const { data: disputesData } = useQuery({
    queryKey: ['batch-disputes', batch?._id],
    queryFn: () => getBatchDisputes(batch._id).then(r => r.data),
    enabled: !!batch?._id,
  });

  const { mutate: reject, isPending: rejecting } = useMutation({
    mutationFn: () => rejectBatch(batch._id),
    onSuccess: () => {
      toast.success('Batch rejected');
      qc.invalidateQueries(['attendance-batches']);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to reject batch'),
  });

  const { mutate: removeBatch, isPending: deleting } = useMutation({
    mutationFn: () => deleteBatch(batch._id),
    onSuccess: () => {
      toast.success('Batch deleted');
      qc.invalidateQueries(['attendance-batches']);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete batch'),
  });

  const attendanceRecords = batchDetail?.records || [];
  const detailBatch = batchDetail?.batch || null;
  const activeBatch = approvalData || detailBatch || batch;
  const currentUserRole = role || user?.roleId?.name || '';
  const st = statusMap[activeBatch.status || batch.status] || statusMap.pending_review;
  const displayId = batch.batchId || batch._id;
  const validationErrors = batch.validationErrors || [];
  const fileName = detailBatch?.s3Key || batch.fileName || '';
  const disputes = disputesData || [];
  const openDisputes = (Array.isArray(disputes) ? disputes : []).filter(d => d.status === 'open');

  return (
    <SidePanel onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Batch {displayId}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{batch.project || batch.projectCode} &middot; {batch.client} &middot; {batch.period}</div>
        </div>
        <button onClick={onClose} style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 16 }}>&times;</button>
      </div>
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <ApprovalStatusCard
          batch={activeBatch}
          currentUserRole={currentUserRole}
          onApprove={() => setApproveModal(batch)}
          onDispute={() => setDisputeModal(batch)}
          onGenerateInvoice={() => setInvoiceModal(batch)}
          onRunSalary={async () => {
            try {
              await runSalary(batch._id);
              toast.success('Salary run started');
              qc.invalidateQueries(['batch-detail', batch._id]);
            } catch (err) {
              toast.error(err.response?.data?.message || 'Failed to start salary run');
            }
          }}
        />

        {openDisputes.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Open disputes</div>
            {openDisputes.map(dispute => (
              <div key={dispute._id} style={{
                background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 10, padding: '12px 14px', marginBottom: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#f87171' }}>
                      Dispute — {dispute.disputeType?.replace(/_/g, ' ')}
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                      By {dispute.raisedBy?.name || 'Unknown'} · {formatRelativeTime(dispute.raisedAt || dispute.createdAt)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>
                      {dispute.reason}
                    </div>
                  </div>
                  <PermissionGate permission="attendance.respond_dispute">
                    <Btn small variant="ghost" onClick={() => setRespondModal(dispute)}>
                      Respond
                    </Btn>
                  </PermissionGate>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <InfoRow label="File" value={fileName || '—'} />
          <InfoRow label="Status" value={<Badge variant={st.variant}>{st.label}</Badge>} />
          <InfoRow label="Total records" value={batch.totalRecords} />
          <InfoRow label="Valid records" value={batch.validRecords} />
          <InfoRow label="Errors" value={batch.errors} />
          <InfoRow label="Uploaded by" value={batch.uploadedBy} />
          <InfoRow label="Upload date" value={formatDate(batch.uploadedAt)} />
        </div>

        {attendanceRecords.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Attendance records ({attendanceRecords.length})</div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textAlign: 'left', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0 }}>Employee</th>
                    <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textAlign: 'left', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0 }}>Name</th>
                    <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textAlign: 'right', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0 }}>Days</th>
                    <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textAlign: 'right', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0 }}>OT hrs</th>
                    <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textAlign: 'left', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRecords.map((rec) => (
                    <tr key={rec._id}>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)' }}>
                        {rec.driverId?.employeeCode || rec.rawEmployeeCode || '—'}
                      </td>
                      <td style={{ padding: '7px 12px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                        {rec.driverId?.fullName || '—'}
                      </td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
                        {rec.workingDays}
                      </td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
                        {rec.overtimeHours || 0}
                      </td>
                      <td style={{ padding: '7px 12px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                        <Badge variant={rec.status === 'valid' ? 'success' : rec.status === 'warning' ? 'warning' : rec.status === 'overridden' ? 'info' : 'danger'}>
                          {rec.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {batch.errors > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Validation errors</div>
            {validationErrors.length > 0 ? (
              <div style={{ border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textAlign: 'left', background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>Employee code</th>
                      <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textAlign: 'left', background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationErrors.map((err, i) => (
                      <tr key={i}>
                        <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)', borderBottom: '1px solid rgba(239,68,68,0.08)' }}>
                          {err.employeeCode || '—'}
                        </td>
                        <td style={{ padding: '7px 12px', fontSize: 12, color: '#f87171', borderBottom: '1px solid rgba(239,68,68,0.08)' }}>
                          {ISSUE_LABELS[err.issue] || err.details || err.issue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: 14, fontSize: 12, color: '#f87171' }}>
                {batch.errors} record(s) have validation issues. Review the uploaded file and re-upload if needed.
              </div>
            )}
          </div>
        )}

        {batch.status === 'pending_review' && hasPermission('attendance.approve') && (
          <div>
            {batch.errors > 0 && (
              <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: 12, fontSize: 12, color: '#f87171', marginBottom: 12 }}>
                Cannot approve batch with {batch.errors} validation error(s). Please resolve all errors before approving.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="danger" onClick={() => reject()} disabled={rejecting}>
                {rejecting ? 'Rejecting...' : 'Reject'}
              </Btn>
            </div>
          </div>
        )}

        {hasPermission('attendance.override') && batch.status !== 'approved' && batch.status !== 'processed' && batch.status !== 'fully_approved' && batch.status !== 'invoiced' && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            {!confirmDelete ? (
              <Btn variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete batch
              </Btn>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>
                  This will permanently delete this batch and all its records. This cannot be undone.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="danger" onClick={() => removeBatch()} disabled={deleting}>
                    {deleting ? 'Deleting...' : 'Confirm delete'}
                  </Btn>
                  <Btn variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Btn>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {approveModal && <ApproveModal batch={approveModal} onClose={() => setApproveModal(null)} onSuccess={() => setApproveModal(null)} />}
      {disputeModal && <DisputeModal batch={disputeModal} onClose={() => setDisputeModal(null)} onSuccess={() => setDisputeModal(null)} />}
      {respondModal && <DisputeResponseModal dispute={respondModal} onClose={() => setRespondModal(null)} onSuccess={() => setRespondModal(null)} />}
      {invoiceModal && <InvoicePreviewModal batch={invoiceModal} onClose={() => setInvoiceModal(null)} onSuccess={() => setInvoiceModal(null)} />}
    </SidePanel>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div>
  </div>
);

const TEMPLATE_COLUMNS = ['employee_code', 'driver_name', 'working_days', 'overtime_hours'];
const TEMPLATE_SAMPLE_ROWS = [
  ['EMP001', 'Ahmed Khan', '22', '5'],
  ['EMP002', 'Sara Ali', '20', '0'],
  ['EMP003', 'Omar Hassan', '25', '8'],
];

const downloadTemplate = () => {
  const header = TEMPLATE_COLUMNS.join(',');
  const rows = TEMPLATE_SAMPLE_ROWS.map((r) => r.join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'attendance_template.csv';
  a.click();
  URL.revokeObjectURL(url);
};

const UploadModal = ({ onClose }) => {
  const { isMobile } = useBreakpoint();
  const fileRef = useRef(null);
  const [projectId, setProjectId] = useState('');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [file, setFile] = useState(null);
  const qc = useQueryClient();

  const { mutate: upload, isPending } = useMutation({
    mutationFn: (formData) => uploadFile(formData),
    onSuccess: () => {
      toast.success('Attendance uploaded successfully');
      qc.invalidateQueries(['attendance-batches']);
      onClose();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Upload failed');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file || !projectId) {
      toast.error('Please select a project and file');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('projectId', projectId);
    fd.append('year', year);
    fd.append('month', month);
    fd.append('columnMapping', JSON.stringify({ employeeCode: 'employee_code', workingDays: 'working_days', overtimeHours: 'overtime_hours' }));
    upload(fd);
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };
  const thStyle = { padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textAlign: 'left', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' };
  const tdStyle = { padding: '5px 10px', fontSize: 11, color: 'var(--text3)', borderBottom: '1px solid var(--border)' };

  return (
    <Modal title="Upload attendance" onClose={onClose} width={520}>
      <form onSubmit={handleSubmit}>
        {/* Template format section */}
        <div style={{ marginBottom: 16, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Required format</div>
            <button
              type="button"
              onClick={downloadTemplate}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border2)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                color: 'var(--accent)',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Download template
            </button>
          </div>
          <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {TEMPLATE_COLUMNS.map((col) => (
                    <th key={col} style={thStyle}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TEMPLATE_SAMPLE_ROWS.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} style={tdStyle}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
            <strong>employee_code</strong> &mdash; required, must match a driver in the system<br />
            <strong>driver_name</strong> &mdash; optional, for reference only<br />
            <strong>working_days</strong> &mdash; required, number between 0&ndash;31<br />
            <strong>overtime_hours</strong> &mdash; optional, defaults to 0
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Project *</label>
          <ProjectSelect value={projectId} onChange={setProjectId} />
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
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Attendance file (CSV / Excel) *</label>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: '2px dashed var(--border2)',
              borderRadius: 8,
              padding: '24px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              color: 'var(--text3)',
              fontSize: 13,
            }}
          >
            {file ? file.name : 'Click to select file or drag & drop'}
          </div>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} style={{ display: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Uploading...' : 'Upload'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default Attendance;
