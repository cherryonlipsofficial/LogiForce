import { useQuery } from '@tanstack/react-query';
import { getSalesContractPipeline } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import KpiCard from '../../components/ui/KpiCard';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useFormatters } from '../../hooks/useFormatters';

const bucketVariant = (bucket) => {
  switch (bucket) {
    case '0-30 days': return 'danger';
    case '31-60 days': return 'warning';
    case '61-90 days': return 'info';
    default: return 'default';
  }
};

const SalesContractPipeline = () => {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const { formatCurrency } = useFormatters();

  const { data, isLoading } = useQuery({
    queryKey: ['report-sales-contract-pipeline'],
    queryFn: () => getSalesContractPipeline(),
  });

  const contracts = data?.data?.contracts || [];
  const bucketSummary = data?.data?.bucketSummary || {};

  const columns = [
    {
      header: 'Contract',
      accessor: 'contractNumber',
      sortable: true,
      render: (val) => val || '-',
    },
    { header: 'Project', accessor: 'projectName', sortable: true },
    { header: 'Client', accessor: 'clientName', sortable: true },
    {
      header: 'Type',
      accessor: 'contractType',
      sortable: true,
      render: (val) => <Badge>{val}</Badge>,
    },
    {
      header: 'Rate',
      accessor: 'ratePerDriver',
      sortable: true,
      align: 'right',
      render: (val) => formatCurrency(val),
    },
    {
      header: 'Start',
      accessor: 'startDate',
      sortable: true,
      render: (val) => val ? new Date(val).toLocaleDateString() : '-',
    },
    {
      header: 'End',
      accessor: 'endDate',
      sortable: true,
      render: (val) => val ? new Date(val).toLocaleDateString() : '-',
    },
    {
      header: 'Days Left',
      accessor: 'daysLeft',
      sortable: true,
      align: 'right',
      render: (val) => (
        <span style={{ color: val <= 30 ? '#f87171' : val <= 60 ? '#fbbf24' : '#4ade80' }}>
          {val}
        </span>
      ),
    },
    {
      header: 'Bucket',
      accessor: 'bucket',
      sortable: true,
      render: (val) => <Badge variant={bucketVariant(val)}>{val}</Badge>,
    },
  ];

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Contract Pipeline"
        subtitle="Contracts expiring within the next 90 days"
        action={<Btn onClick={() => navigate('/reports')}>Back to Reports</Btn>}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            <KpiCard label="0-30 days" value={bucketSummary['0-30 days'] ?? 0} color="#f87171" />
            <KpiCard label="31-60 days" value={bucketSummary['31-60 days'] ?? 0} color="#fbbf24" />
            <KpiCard label="61-90 days" value={bucketSummary['61-90 days'] ?? 0} color="#4f8ef7" />
          </div>

          <DataTable columns={columns} data={contracts} searchable />
        </>
      )}
    </div>
  );
};

export default SalesContractPipeline;
