import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSalesRevenueByClient } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DataTable from '../../components/ui/DataTable';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useFormatters } from '../../hooks/useFormatters';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const YEARS = [2024, 2025, 2026];

const SalesRevenueByClient = () => {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const { formatCurrency } = useFormatters();
  const [year, setYear] = useState(new Date().getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ['report-sales-revenue-by-client', year],
    queryFn: () => getSalesRevenueByClient({ year }),
  });

  const rows = data?.data || [];

  const chartData = rows.map((r) => ({
    clientName: r.clientName,
    totalRevenue: r.totalRevenue,
  }));

  const columns = [
    { header: 'Client', accessor: 'clientName', sortable: true },
    {
      header: 'Total Revenue',
      accessor: 'totalRevenue',
      sortable: true,
      align: 'right',
      render: (val) => formatCurrency(val),
    },
    { header: 'Invoices', accessor: 'totalInvoices', sortable: true, align: 'right' },
  ];

  const selectStyle = {
    padding: '6px 10px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: 13,
  };

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Revenue by Client"
        subtitle="Total revenue and invoice count per client"
        action={<Btn onClick={() => navigate('/reports')}>Back to Reports</Btn>}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle}>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
            <ResponsiveContainer width="100%" height={Math.max(300, rows.length * 40)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                <YAxis dataKey="clientName" type="category" tick={{ fill: 'var(--text3)', fontSize: 11 }} width={110} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="totalRevenue" fill="#4f8ef7" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <DataTable columns={columns} data={rows} searchable />
        </>
      )}
    </div>
  );
};

export default SalesRevenueByClient;
