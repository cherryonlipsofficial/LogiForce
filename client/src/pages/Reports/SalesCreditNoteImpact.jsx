import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSalesCreditNoteImpact } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DataTable from '../../components/ui/DataTable';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useFormatters } from '../../hooks/useFormatters';

const YEARS = [2024, 2025, 2026];

const SalesCreditNoteImpact = () => {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const { formatCurrency } = useFormatters();
  const [year, setYear] = useState(new Date().getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ['report-sales-credit-note-impact', year],
    queryFn: () => getSalesCreditNoteImpact({ year }),
  });

  const rows = data?.data || [];

  const columns = [
    { header: 'Client', accessor: 'clientName', sortable: true },
    {
      header: 'Credit Notes',
      accessor: 'totalCreditNotes',
      sortable: true,
      align: 'right',
      render: (val) => formatCurrency(val),
    },
    { header: 'CN Count', accessor: 'creditNoteCount', sortable: true, align: 'right' },
    {
      header: 'Invoiced',
      accessor: 'totalInvoiced',
      sortable: true,
      align: 'right',
      render: (val) => formatCurrency(val),
    },
    {
      header: 'Impact %',
      accessor: 'impactPercent',
      sortable: true,
      align: 'right',
      render: (val) => (
        <span style={{ color: val > 10 ? '#f87171' : val > 5 ? '#fbbf24' : '#4ade80' }}>
          {val}%
        </span>
      ),
    },
    {
      header: 'Net Revenue',
      accessor: 'netRevenue',
      sortable: true,
      align: 'right',
      render: (val) => formatCurrency(val),
    },
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
        title="Credit Note Impact"
        subtitle="Credit note totals and impact on invoiced revenue"
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
        <DataTable columns={columns} data={rows} searchable />
      )}
    </div>
  );
};

export default SalesCreditNoteImpact;
