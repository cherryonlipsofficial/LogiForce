import { useQuery } from '@tanstack/react-query';
import { getOpsVehicleUtilization } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';
import KpiCard from '../../components/ui/KpiCard';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const statusVariant = (s) => {
  switch (s) {
    case 'assigned': return 'success';
    case 'available': return 'info';
    case 'maintenance': return 'warning';
    case 'off_hired': return 'danger';
    case 'reserved': return 'purple';
    default: return 'default';
  }
};

const columns = [
  { header: 'Plate', accessor: 'plate', sortable: true },
  { header: 'Make', accessor: 'make', sortable: true },
  { header: 'Model', accessor: 'model', sortable: true },
  { header: 'Type', accessor: 'vehicleType', sortable: true },
  {
    header: 'Status',
    accessor: 'status',
    sortable: true,
    render: (val) => <Badge variant={statusVariant(val)}>{val?.replace(/_/g, ' ')}</Badge>,
  },
  { header: 'Supplier', accessor: 'supplierName', sortable: true },
  {
    header: 'Driver',
    accessor: 'currentDriver',
    sortable: true,
    render: (val) => val || 'Idle',
  },
  {
    header: 'Monthly Rate',
    accessor: 'monthlyRate',
    sortable: true,
    align: 'right',
  },
  {
    header: 'Idle Days',
    accessor: 'totalIdleDays',
    sortable: true,
    align: 'right',
  },
];

const OpsVehicleUtilization = () => {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();

  const { data, isLoading } = useQuery({
    queryKey: ['report-ops-vehicle-utilization'],
    queryFn: () => getOpsVehicleUtilization(),
  });

  const vehicles = data?.data?.vehicles || [];
  const summary = data?.data?.summary;

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Vehicle Utilization"
        subtitle="Current vehicle fleet status and utilization"
        action={<Btn onClick={() => navigate('/reports')}>Back to Reports</Btn>}
      />

      {isLoading ? <LoadingSpinner /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 12 }}>
            <KpiCard label="Assigned" value={summary?.assigned ?? 0} color="#4ade80" />
            <KpiCard label="Available" value={summary?.available ?? 0} color="#4f8ef7" />
            <KpiCard label="Maintenance" value={summary?.maintenance ?? 0} color="#fbbf24" />
            <KpiCard label="Off-Hired" value={summary?.off_hired ?? 0} color="#f87171" />
            <KpiCard label="Reserved" value={summary?.reserved ?? 0} />
          </div>

          <DataTable
            columns={columns}
            data={vehicles}
            searchable
            searchPlaceholder="Search vehicles..."
          />
        </>
      )}
    </div>
  );
};

export default OpsVehicleUtilization;
