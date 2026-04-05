import { useQuery } from '@tanstack/react-query';
import { getOpsHeadcountVsPlan } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DataTable from '../../components/ui/DataTable';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const varianceColor = (val) => (val >= 0 ? '#4ade80' : '#f87171');

const fillRateColor = (val) => {
  if (val == null) return 'var(--text3)';
  if (val >= 100) return '#4ade80';
  if (val >= 70) return '#fbbf24';
  return '#f87171';
};

const columns = [
  { header: 'Project', accessor: 'projectName', sortable: true },
  { header: 'Client', accessor: 'clientName', sortable: true },
  { header: 'Planned', accessor: 'planned', sortable: true, align: 'right' },
  { header: 'Actual', accessor: 'actual', sortable: true, align: 'right' },
  {
    header: 'Variance',
    accessor: 'variance',
    sortable: true,
    align: 'right',
    render: (val) => (
      <span style={{ color: varianceColor(val), fontWeight: 600 }}>{val}</span>
    ),
  },
  {
    header: 'Fill Rate',
    accessor: 'fillRate',
    sortable: true,
    align: 'right',
    render: (val) => (
      <span style={{ color: fillRateColor(val), fontWeight: 600 }}>
        {val != null ? `${val}%` : 'N/A'}
      </span>
    ),
  },
];

const OpsHeadcountVsPlan = () => {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();

  const { data, isLoading } = useQuery({
    queryKey: ['report-ops-headcount-vs-plan'],
    queryFn: () => getOpsHeadcountVsPlan(),
  });

  const rows = data?.data || [];

  const chartData = rows.map((r) => ({
    project: r.projectName,
    planned: r.planned,
    actual: r.actual,
  }));

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Headcount vs Plan"
        subtitle="Planned versus actual headcount per project"
        action={<Btn onClick={() => navigate('/reports')}>Back to Reports</Btn>}
      />

      {isLoading ? <LoadingSpinner /> : (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
            <ResponsiveContainer width="100%" height={Math.max(300, rows.length * 40)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                <YAxis dataKey="project" type="category" tick={{ fill: 'var(--text3)', fontSize: 11 }} width={110} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Legend />
                <Bar dataKey="planned" fill="#4f8ef7" />
                <Bar dataKey="actual" fill="#4ade80" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <DataTable
            columns={columns}
            data={rows}
          />
        </>
      )}
    </div>
  );
};

export default OpsHeadcountVsPlan;
