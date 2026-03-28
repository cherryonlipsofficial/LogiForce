import Badge from '../ui/Badge';
import Btn from '../ui/Btn';
import { formatDate } from '../../utils/formatters';

const approvalIcon = (status) => {
  if (status === 'approved') return { symbol: '✓', color: '#4ade80' };
  if (status === 'disputed') return { symbol: '✗', color: '#f87171' };
  return { symbol: '◎', color: '#fbbf24' };
};

const ApprovalRow = ({ label, approval }) => {
  const status = approval?.status || 'pending';
  const icon = approvalIcon(status);

  let valueText = 'Pending review';
  let valueColor = 'var(--text3)';
  if (status === 'approved') {
    valueText = `Approved by ${approval.approvedBy?.name || 'Unknown'} on ${formatDate(approval.approvedAt)}`;
    valueColor = '#4ade80';
  } else if (status === 'disputed') {
    valueText = `Disputed by ${approval.disputedBy?.name || 'Unknown'}`;
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

const ApprovalStatusCard = ({ batch, currentUserRole, onApprove, onDispute, onGenerateInvoice }) => {
  const salesApproval = batch?.approvals?.find(a => a.role === 'sales') || null;
  const opsApproval = batch?.approvals?.find(a => a.role === 'ops') || null;

  const status = batch?.status;
  const roleName = currentUserRole?.toLowerCase();

  const canAct = ['pending_review', 'sales_approved', 'ops_approved', 'dispute_responded'].includes(status);
  const isSalesOrOps = roleName === 'sales' || roleName === 'ops';

  const ownApproval = roleName === 'sales' ? salesApproval : roleName === 'ops' ? opsApproval : null;
  const hasApproved = ownApproval?.status === 'approved';

  const showApproveActions = isSalesOrOps && canAct && !hasApproved;
  const showGenerateInvoice = roleName === 'accountant' && status === 'fully_approved';
  const isInvoiced = status === 'invoiced';
  const isDisputed = roleName === 'accountant' && status === 'disputed';

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Approval status</div>

      <ApprovalRow label="Sales team" approval={salesApproval} />
      <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
      <ApprovalRow label="Operations" approval={opsApproval} />

      {showApproveActions && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <Btn variant="success" onClick={onApprove}>✓ Approve</Btn>
          <Btn variant="ghost" onClick={onDispute} style={{
            color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)',
          }}>⚑ Raise dispute</Btn>
        </div>
      )}

      {showGenerateInvoice && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <Btn variant="primary" onClick={onGenerateInvoice} style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', fontSize: 14 }}>
            Generate invoice →
          </Btn>
          <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 6 }}>
            Both teams have approved. Invoice will include VAT (5%).
          </div>
        </div>
      )}

      {isDisputed && (
        <div style={{
          marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)',
          background: 'rgba(239,68,68,0.04)', borderRadius: 8, padding: 12,
          fontSize: 12, color: '#f87171',
        }}>
          A dispute has been raised. Review the dispute below and respond.
        </div>
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
