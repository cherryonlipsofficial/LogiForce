import { useQuery } from '@tanstack/react-query';
import { getSalesRateComparison } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useFormatters } from '../../hooks/useFormatters';

const SalesRateComparison = () => {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const { formatCurrency } = useFormatters();

  const { data, isLoading } = useQuery({
    queryKey: ['report-sales-rate-comparison'],
    queryFn: () => getSalesRateComparison(),
  });

  const clients = data?.data || [];

  const columns = [
    { header: 'Project', accessor: 'projectName', sortable: true },
    {
      header: 'Rate/Driver',
      accessor: 'ratePerDriver',
      sortable: true,
      align: 'right',
      render: (val) => formatCurrency(val),
    },
    {
      header: 'Rate Basis',
      accessor: 'rateBasis',
      sortable: true,
      render: (val) => <Badge>{val}</Badge>,
    },
    { header: 'Active Drivers', accessor: 'activeDrivers', sortable: true, align: 'right' },
    {
      header: 'Monthly Value',
      accessor: 'monthlyValue',
      sortable: true,
      align: 'right',
      render: (val) => val != null ? formatCurrency(val) : '-',
    },
  ];

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Rate Comparison"
        subtitle="Driver rates and monthly value by client and project"
        action={<Btn onClick={() => navigate('/reports')}>Back to Reports</Btn>}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        clients.map((client, idx) => (
          <div key={client.clientName || idx}>
            <h2 style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--text)',
              marginBottom: 8,
              marginTop: idx > 0 ? 8 : 0,
            }}>
              {client.clientName}
            </h2>
            <DataTable columns={columns} data={client.projects || []} />
          </div>
        ))
      )}
    </div>
  );
};

export default SalesRateComparison;
