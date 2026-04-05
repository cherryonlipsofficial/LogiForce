import { useQuery } from '@tanstack/react-query';
import { getOpsSimAllocation } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';
import KpiCard from '../../components/ui/KpiCard';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const operatorVariant = (val) => {
  switch (val) {
    case 'etisalat': return 'info';
    case 'du': return 'purple';
    case 'virgin': return 'success';
    default: return 'default';
  }
};

const statusVariant = (val) => {
  switch (val) {
    case 'active': return 'success';
    case 'idle': return 'warning';
    case 'suspended': return 'danger';
    case 'terminated': return 'default';
    default: return 'default';
  }
};

const columns = [
  { header: 'SIM Number', accessor: 'simNumber', sortable: true },
  {
    header: 'Operator',
    accessor: 'operator',
    sortable: true,
    render: (val) => <Badge variant={operatorVariant(val)}>{val}</Badge>,
  },
  { header: 'Plan', accessor: 'plan', sortable: true },
  {
    header: 'Monthly Cost',
    accessor: 'monthlyPlanCost',
    sortable: true,
    align: 'right',
  },
  {
    header: 'Status',
    accessor: 'status',
    sortable: true,
    render: (val) => <Badge variant={statusVariant(val)}>{val?.replace(/_/g, ' ')}</Badge>,
  },
  {
    header: 'Driver',
    accessor: 'driverName',
    sortable: true,
    render: (val) => val || 'Unassigned',
  },
  { header: 'Employee Code', accessor: 'employeeCode', sortable: true },
];

const OpsSimAllocation = () => {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();

  const { data, isLoading } = useQuery({
    queryKey: ['report-ops-sim-allocation'],
    queryFn: () => getOpsSimAllocation(),
  });

  const sims = data?.data?.sims || [];
  const summary = data?.data?.summary;

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="SIM Allocation"
        subtitle="SIM card allocation and status overview"
        action={<Btn onClick={() => navigate('/reports')}>Back to Reports</Btn>}
      />

      {isLoading ? <LoadingSpinner /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
            <KpiCard label="Active" value={summary?.active ?? 0} color="#4ade80" />
            <KpiCard label="Idle" value={summary?.idle ?? 0} color="#fbbf24" />
            <KpiCard label="Suspended" value={summary?.suspended ?? 0} color="#f87171" />
            <KpiCard label="Terminated" value={summary?.terminated ?? 0} />
          </div>

          <DataTable
            columns={columns}
            data={sims}
            searchable
            searchPlaceholder="Search SIM cards..."
          />
        </>
      )}
    </div>
  );
};

export default OpsSimAllocation;
