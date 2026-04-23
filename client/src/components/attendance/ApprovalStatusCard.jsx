import Badge from '../ui/Badge';
import Btn from '../ui/Btn';
import PermissionGate from '../ui/PermissionGate';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../utils/formatters';

const approvalIcon = (status) => {
  if (status === 'approved') return { symbol: '✓', color: '#4ade80' };
  if (status === 'disputed') return { symbol: '✗', color: '#f87171' };
  return { symbol: '◎', color: '#fbbf24' };
};

const statusSummary = {
  uploaded:           { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.2)', text: 'Uploaded — awaiting review' },
  pending_review:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  text: 'Under review by Sales and Operations' },
  sales_approved:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)',  text: 'Sales approved — Operations pending' },
  ops_approved:       { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)',  text: 'Operations approved — Sales pending' },
  fully_approved:     { color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   text: 'Both teams approved ✓' },
  disputed:           { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   text: 'Dispute raised — Accounts coordinating with client' },
  dispute_responded:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  text: 'Revised attendance uploaded — please re-review' },
  invoiced:           { color: '#a855f7', bg: 'rgba(168,85,247,0.08)',  border: 'rgba(168,85,247,0.2)',  text: 'Invoice generated' },
  processed:          { color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   text: 'Processed — salary run completed' },
  rejected:           { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   text: 'Batch rejected' },
};

const ApprovalRow = ({ label, approval }) => {
  const status = approval?.status || 'pending';
  const icon = approvalIcon(status);

  let valueText = 'Pending review';
  let valueColor = 'var(--text3)';
  if (status === 'approved') {
    const approverName = approval.approvedByName || approval.approvedBy?.name || '';
    valueText = approverName
      ? `Approved by ${approverName}${approval.approvedAt ? ` on ${formatDate(approval.approvedAt)}` : ''}`
      : 'Approved';
    valueColor = '#4ade80';
  } else if (status === 'disputed') {
    const disputerName = approval.disputedByName || approval.disputedBy?.name || '';
    valueText = disputerName ? `Disputed by ${disputerName}` : 'Disputed';
    valueColor = '#f87171';
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
      <span style={{
        width: 22, height: 22, borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 12,
        fontWeight: 700, background: `${icon.color}18`, color: icon.color,
        border: `1.5px solid ${icon.color}40`, flexShrink: 0,
      }}>
        {icon.symbol}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: valueColor, marginTop: 1 }}>{valueText}</div>
      </div>
    </div>
  );
};

// Derive individual approval status from batch.status when subdocument data is missing
const deriveApproval = (subdoc, isApprovedByStatus) => {
  if (subdoc?.status === 'approved' || subdoc?.status === 'disputed') return subdoc;
  if (isApprovedByStatus) return { ...subdoc, status: 'approved' };
  return subdoc || null;
};

const ApprovalStatusCard = ({ batch, onApprove, onDispute, onRespondDispute, onGenerateInvoice, onRunSalary }) => {
  const { hasPermission } = useAuth();
  const status = batch?.status;

  const salesApprovedByStatus = ['sales_approved', 'fully_approved', 'invoiced'].includes(status);
  const opsApprovedByStatus = ['ops_approved', 'fully_approved', 'invoiced'].includes(status);

  const salesApproval = deriveApproval(batch?.salesApproval, salesApprovedByStatus);
  const opsApproval = deriveApproval(batch?.opsApproval, opsApprovedByStatus);

  const canAct = ['pending_review', 'sales_approved', 'ops_approved', 'dispute_responded'].includes(status);
  const canApproveSales = hasPermission('attendance.approve_sales');
  const canApproveOps = hasPermission('attendance.approve_ops');

  const ownApproval = canApproveSales ? salesApproval : canApproveOps ? opsApproval : null;
  const hasApproved = ownApproval?.status === 'approved';

  const showApproveActions = canAct && !hasApproved;
  const showGenerateInvoice = status === 'fully_approved';
  const isInvoiced = status === 'invoiced';
  const isDisputed = status === 'disputed';

  const summary = statusSummary[status] || statusSummary.pending_review;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Approval status</div>

      {/* Status summary bar */}
      <div style={{
        background: summary.bg, border: `1px solid ${summary.border}`,
        borderRadius: 8, padding: '8px 12px', marginBottom: 12,
        fontSize: 12, color: summary.color, fontWeight: 500,
      }}>
        {summary.text}
      </div>

      <ApprovalRow label="Sales team" approval={salesApproval} />
      <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
      <ApprovalRow label="Operations" approval={opsApproval} />

      {showApproveActions && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <PermissionGate anyOf={['attendance.approve_sales', 'attendance.approve_ops']}>
            <Btn variant="success" onClick={onApprove}>✓ Approve attendance</Btn>
          </PermissionGate>
          <PermissionGate permission="attendance.dispute">
            <Btn variant="ghost" onClick={onDispute} style={{
              color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)',
            }}>⚑ Raise dispute</Btn>
          </PermissionGate>
        </div>
      )}

      {showGenerateInvoice && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <PermissionGate permission="invoices.generate">
            <Btn variant="primary" onClick={onGenerateInvoice} style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', fontSize: 14 }}>
              Generate invoice →
            </Btn>
          </PermissionGate>
          {onRunSalary && (
            <PermissionGate permission="salary.run">
              <Btn variant="ghost" onClick={onRunSalary} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                Run salary →
              </Btn>
            </PermissionGate>
          )}
          <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 6 }}>
            Both teams have approved. Invoice will include VAT (5%).
          </div>
        </div>
      )}

      {isDisputed && (
        <PermissionGate permission="attendance.respond_dispute">
          <div style={{
            marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)',
            background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 12,
            fontSize: 12, color: '#f59e0b',
          }}>
            Dispute raised. Coordinate with client, then upload revised attendance.
            {onRespondDispute && (
              <div style={{ marginTop: 10 }}>
                <Btn small variant="primary" onClick={onRespondDispute}>
                  Respond to dispute
                </Btn>
              </div>
            )}
          </div>
        </PermissionGate>
      )}

      {isInvoiced && (
        <div style={{
          marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge variant="success">✓ Invoice generated — {batch.invoiceNo || batch.invoice?.invoiceNo || ''}</Badge>
          </div>
          {(batch.invoiceId || batch.invoice?._id) && (
            <div style={{ marginTop: 6 }}>
              <a href={`/invoices/${batch.invoiceId || batch.invoice?._id}`} style={{ fontSize: 12, color: 'var(--accent)' }}>
                View invoice →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ApprovalStatusCard;
