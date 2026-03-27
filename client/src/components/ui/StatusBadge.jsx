import Badge from './Badge';

const statusMap = {
  active: { label: 'Active', variant: 'success' },
  on_leave: { label: 'On leave', variant: 'info' },
  suspended: { label: 'Suspended', variant: 'danger' },
  pending_kyc: { label: 'Pending KYC', variant: 'warning' },
  pending_verification: { label: 'Pending verification', variant: 'warning' },
  onboarding: { label: 'Onboarding', variant: 'info' },
  resigned: { label: 'Resigned', variant: 'default' },
  paid: { label: 'Paid', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  overdue: { label: 'Overdue', variant: 'danger' },
  sent: { label: 'Sent', variant: 'info' },
  draft: { label: 'Draft', variant: 'default' },
  approved: { label: 'Approved', variant: 'success' },
  pending_approval: { label: 'Pending approval', variant: 'warning' },
  processed: { label: 'Processed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
};

const StatusBadge = ({ status }) => {
  const s = statusMap[status] || { label: status, variant: 'default' };
  return <Badge variant={s.variant}>{s.label}</Badge>;
};

export default StatusBadge;
