import { useQuery } from '@tanstack/react-query';
import { getOpsVehicleReturn } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';
import KpiCard from '../../components/ui/KpiCard';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const conditionVariant = (val) => {
  switch (val) {
    case 'good': return 'success';
    case 'minor_damage': return 'warning';
    case 'major_damage': return 'danger';
    case 'total_loss': return 'danger';
    default: return 'default';
  }
};

const columns = [
  { header: 'Vehicle', accessor: 'vehiclePlate', sortable: true },
  { header: 'Make/Model', accessor: 'vehicleMakeModel', sortable: true },
  { header: 'Driver', accessor: 'driverName', sortable: true },
  { header: 'Code', accessor: 'employeeCode', sortable: true },
  {
    header: 'Assigned',
    accessor: 'assignedDate',
    sortable: true,
    render: (val) => val ? new Date(val).toLocaleDateString() : '-',
  },
  {
    header: 'Returned',
    accessor: 'returnedDate',
    sortable: true,
    render: (val) => val ? new Date(val).toLocaleDateString() : '-',
  },
  {
    header: 'Condition',
    accessor: 'returnCondition',
    sortable: true,
    render: (val) => (
      <Badge variant={conditionVariant(val)}>{val?.replace(/_/g, ' ')}</Badge>
    ),
  },
  {
    header: 'Penalty',
    accessor: 'damagePenaltyAmount',
    sortable: true,
    align: 'right',
    render: (val) => (val != null && val !== 0) ? Number(val).toLocaleString() : '-',
  },
];

const OpsVehicleReturn = () => {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();

  const { data, isLoading } = useQuery({
    queryKey: ['report-ops-vehicle-return'],
    queryFn: () => getOpsVehicleReturn(),
  });

  const returns = data?.data?.returns || [];
  const cs = data?.data?.conditionSummary;

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Vehicle Return"
        subtitle="Returned vehicles and condition summary"
        action={<Btn onClick={() => navigate('/reports')}>Back to Reports</Btn>}
      />

      {isLoading ? <LoadingSpinner /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
            <KpiCard label="Good" value={cs?.good ?? 0} color="#4ade80" />
            <KpiCard label="Minor Damage" value={cs?.minor_damage ?? 0} color="#fbbf24" />
            <KpiCard label="Major Damage" value={cs?.major_damage ?? 0} color="#f87171" />
            <KpiCard label="Total Loss" value={cs?.total_loss ?? 0} color="#ef4444" />
          </div>

          <DataTable
            columns={columns}
            data={returns}
            searchable
            searchPlaceholder="Search returns..."
          />
        </>
      )}
    </div>
  );
};

export default OpsVehicleReturn;
