import { useQuery } from '@tanstack/react-query';
import { getOpsAssignmentHistory } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';

const statusVariant = (s) => {
  switch (s) {
    case 'active':
      return 'success';
    case 'completed':
      return 'info';
    case 'terminated':
      return 'danger';
    default:
      return 'default';
  }
};

const OpsAssignmentHistory = () => {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['report-ops-assignment-history'],
    queryFn: () => getOpsAssignmentHistory(),
  });

  const rows = data?.data || [];

  const columns = [
    { header: 'Driver', accessor: 'driverName', sortable: true },
    { header: 'Employee Code', accessor: 'employeeCode', sortable: true },
    { header: 'Project', accessor: 'projectName', sortable: true },
    { header: 'Client', accessor: 'clientName', sortable: true },
    {
      header: 'Rate',
      accessor: 'ratePerDriver',
      sortable: true,
      align: 'right',
      render: (val) => (val != null ? Number(val).toLocaleString() : '-'),
    },
    {
      header: 'Assigned',
      accessor: 'assignedDate',
      sortable: true,
      render: (val) => (val ? new Date(val).toLocaleDateString() : '-'),
    },
    {
      header: 'Unassigned',
      accessor: 'unassignedDate',
      sortable: true,
      render: (val) => (val ? new Date(val).toLocaleDateString() : 'Current'),
    },
    {
      header: 'Duration',
      accessor: 'durationDays',
      sortable: true,
      align: 'right',
      render: (val) => (val != null ? `${val} days` : '-'),
    },
    {
      header: 'Status',
      accessor: 'status',
      sortable: true,
      render: (val) => (
        <Badge variant={statusVariant(val)}>{(val || '').replace(/_/g, ' ')}</Badge>
      ),
    },
  ];

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Assignment History"
        subtitle="Driver project assignment history and durations"
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

export default OpsAssignmentHistory;
