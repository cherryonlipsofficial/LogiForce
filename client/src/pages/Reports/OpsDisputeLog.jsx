import { useQuery } from '@tanstack/react-query';
import { getOpsDisputeLog } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';

const statusVariant = (s) => {
  switch (s) {
    case 'open':
      return 'danger';
    case 'responded':
      return 'warning';
    case 'resolved':
      return 'success';
    default:
      return 'default';
  }
};

const OpsDisputeLog = () => {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['report-ops-dispute-log'],
    queryFn: () => getOpsDisputeLog(),
  });

  const rows = data?.data || [];

  const columns = [
    { header: 'Batch Ref', accessor: 'batchRef', sortable: true },
    { header: 'Project', accessor: 'projectName', sortable: true },
    {
      header: 'Type',
      accessor: 'disputeType',
      sortable: true,
      render: (val) => <Badge variant="info">{(val || '').replace(/_/g, ' ')}</Badge>,
    },
    {
      header: 'Status',
      accessor: 'status',
      sortable: true,
      render: (val) => (
        <Badge variant={statusVariant(val)}>{(val || '').replace(/_/g, ' ')}</Badge>
      ),
    },
    { header: 'Raised By', accessor: 'raisedBy', sortable: true },
    { header: 'Role', accessor: 'raisedByRole', sortable: true },
    {
      header: 'Raised At',
      accessor: 'raisedAt',
      sortable: true,
      render: (val) => (val ? new Date(val).toLocaleDateString() : '-'),
    },
    {
      header: 'Turnaround',
      accessor: 'turnaroundHours',
      sortable: true,
      align: 'right',
      render: (val) => (val != null ? `${val}h` : '-'),
    },
    { header: 'Responded By', accessor: 'respondedBy', sortable: true },
  ];

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Dispute Log"
        subtitle="Attendance disputes and resolution tracking"
        action={<Btn onClick={() => navigate('/reports')}>Back to Reports</Btn>}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <DataTable columns={columns} data={rows} searchable />
      )}
    </div>
  );
};

export default OpsDisputeLog;
