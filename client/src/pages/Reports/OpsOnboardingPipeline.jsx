import { useQuery } from '@tanstack/react-query';
import { getOpsOnboardingPipeline } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';

const stageVariant = (s) => {
  switch (s) {
    case 'draft':
      return 'default';
    case 'pending_kyc':
      return 'warning';
    case 'pending_verification':
      return 'info';
    default:
      return 'default';
  }
};

const OpsOnboardingPipeline = () => {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['report-ops-onboarding-pipeline'],
    queryFn: () => getOpsOnboardingPipeline(),
  });

  const drivers = data?.data?.drivers || [];
  const stageSummary = data?.data?.stageSummary || {};

  const columns = [
    { header: 'Driver', accessor: 'fullName', sortable: true },
    { header: 'Employee Code', accessor: 'employeeCode', sortable: true },
    {
      header: 'Stage',
      accessor: 'status',
      sortable: true,
      render: (val) => (
        <Badge variant={stageVariant(val)}>{(val || '').replace(/_/g, ' ')}</Badge>
      ),
    },
    { header: 'Client', accessor: 'clientName', sortable: true },
    { header: 'Project', accessor: 'projectName', sortable: true },
    {
      header: 'Created',
      accessor: 'createdAt',
      sortable: true,
      render: (val) => (val ? new Date(val).toLocaleDateString() : '-'),
    },
    {
      header: 'Days in Pipeline',
      accessor: 'daysSinceCreated',
      sortable: true,
      align: 'right',
      render: (val) => (
        <span style={{ color: val > 14 ? 'var(--danger)' : 'var(--text)', fontWeight: val > 14 ? 600 : 400 }}>
          {val != null ? val : '-'}
        </span>
      ),
    },
  ];

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Onboarding Pipeline"
        subtitle="Drivers currently in the onboarding pipeline"
        action={<Btn onClick={() => navigate('/reports')}>Back to Reports</Btn>}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
            <KpiCard label="Draft" value={stageSummary.draft || 0} />
            <KpiCard label="Pending KYC" value={stageSummary.pending_kyc || 0} />
            <KpiCard label="Pending Verification" value={stageSummary.pending_verification || 0} />
          </div>

          <DataTable columns={columns} data={drivers} searchable />
        </>
      )}
    </div>
  );
};

export default OpsOnboardingPipeline;
