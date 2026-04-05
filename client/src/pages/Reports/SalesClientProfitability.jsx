import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSalesClientProfitability } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import KpiCard from '../../components/ui/KpiCard';
import DataTable from '../../components/ui/DataTable';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useFormatters } from '../../hooks/useFormatters';

const now = new Date();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS = [2024, 2025, 2026];

const SalesClientProfitability = () => {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const { formatCurrency, formatCurrencyFull } = useFormatters();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery({
    queryKey: ['report-sales-client-profitability', year, month],
    queryFn: () => getSalesClientProfitability({ year, month }),
  });

  const rows = data?.data || [];

  const totalRevenue = rows.reduce((sum, r) => sum + (r.revenue || 0), 0);
  const totalCost = rows.reduce((sum, r) => sum + (r.cost || 0), 0);
  const totalMargin = rows.reduce((sum, r) => sum + (r.grossMargin || 0), 0);

  const columns = [
    { header: 'Client', accessor: 'clientName', sortable: true },
    {
      header: 'Revenue',
      accessor: 'revenue',
      sortable: true,
      align: 'right',
      render: (val) => formatCurrency(val),
    },
    {
      header: 'Cost',
      accessor: 'cost',
      sortable: true,
      align: 'right',
      render: (val) => formatCurrency(val),
    },
    {
      header: 'Gross Margin',
      accessor: 'grossMargin',
      sortable: true,
      align: 'right',
      render: (val) => (
        <span style={{ color: val >= 0 ? '#4ade80' : '#f87171' }}>
          {formatCurrency(val)}
        </span>
      ),
    },
    {
      header: 'Margin %',
      accessor: 'marginPercent',
      sortable: true,
      align: 'right',
      render: (val) => (
        <span style={{ color: val >= 0 ? '#4ade80' : '#f87171' }}>
          {val}%
        </span>
      ),
    },
    { header: 'Drivers', accessor: 'driverCount', sortable: true, align: 'right' },
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
        title="Client Profitability"
        subtitle="Revenue, cost and margin breakdown by client"
        action={<Btn onClick={() => navigate('/reports')}>Back to Reports</Btn>}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle}>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={selectStyle}>
          {MONTHS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            <KpiCard label="Total Revenue" value={formatCurrencyFull(totalRevenue)} />
            <KpiCard label="Total Cost" value={formatCurrencyFull(totalCost)} />
            <KpiCard
              label="Total Margin"
              value={formatCurrencyFull(totalMargin)}
              color={totalMargin >= 0 ? '#4ade80' : '#f87171'}
            />
          </div>

          <DataTable columns={columns} data={rows} searchable />
        </>
      )}
    </div>
  );
};

export default SalesClientProfitability;
