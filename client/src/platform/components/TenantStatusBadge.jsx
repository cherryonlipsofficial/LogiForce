import Badge from '../../components/ui/Badge';

const VARIANTS = { active: 'success', suspended: 'warning', archived: 'default', provisioning: 'info' };

export default function TenantStatusBadge({ status }) {
  return <Badge variant={VARIANTS[status] || 'default'}>{status}</Badge>;
}
