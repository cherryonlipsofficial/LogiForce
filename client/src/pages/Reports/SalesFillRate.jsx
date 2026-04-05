import { useQuery } from '@tanstack/react-query';
import { getSalesFillRate } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DataTable from '../../components/ui/DataTable';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useFormatters } from '../../hooks/useFormatters';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const SalesFillRate = () => {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const { formatCurrency } = useFormatters();

  const { data, isLoading } = useQuery({
    queryKey: ['report-sales-fill-rate'],
    queryFn: () => getSalesFillRate(),
  });

  const rows = data?.data || [];

  const chartData = rows.map((r) => ({
    projectName: r.projectName,
    planned: r.planned,
    active: r.active,
  }));

  const columns = [
    { header: 'Project', accessor: 'projectName', sortable: true },
    { header: 'Client', accessor: 'clientName', sortable: true },
    { header: 'Planned', accessor: 'planned', sortable: true, align: 'right' },
    { header: 'Active', accessor: 'active', sortable: true, align: 'right' },
    {
      header: 'Fill Rate',
      accessor: 'fillRate',
      sortable: true,
      align: 'right',
      render: (val) => {
        if (val == null) return 'N/A';
        const color = val >= 100 ? '#4ade80' : val >= 70 ? '#fbbf24' : '#f87171';
        return <span style={{ color }}>{val}%</span>;
      },
    },
    {
      header: 'Gap',
      accessor: 'gap',
      sortable: true,
      align: 'right',
      render: (val) => (
        <span style={{ color: val > 0 ? '#f87171' : '#4ade80' }}>
          {val}
        </span>
      ),
    },
  ];

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Fill Rate"
        subtitle="Planned vs active driver counts per project"
        action={<Btn onClick={() => navigate('/reports')}>Back to Reports</Btn>}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
            <ResponsiveContainer width="100%" height={Math.max(300, rows.length * 40)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                <YAxis dataKey="projectName" type="category" tick={{ fill: 'var(--text3)', fontSize: 11 }} width={110} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Legend />
                <Bar dataKey="planned" fill="#4f8ef7" />
                <Bar dataKey="active" fill="#4ade80" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <DataTable columns={columns} data={rows} searchable />
        </>
      )}
    </div>
  );
};

export default SalesFillRate;
