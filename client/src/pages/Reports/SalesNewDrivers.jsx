import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSalesNewDrivers } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DataTable from '../../components/ui/DataTable';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const defaultFrom = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
};
const defaultTo = () => new Date().toISOString().slice(0, 10);

const SalesNewDrivers = () => {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);

  const { data, isLoading } = useQuery({
    queryKey: ['report-sales-new-drivers', dateFrom, dateTo],
    queryFn: () => getSalesNewDrivers({ dateFrom, dateTo }),
  });

  const rows = data?.data || [];

  const columns = [
    { header: 'Client', accessor: 'clientName', sortable: true },
    { header: 'Project', accessor: 'projectName', sortable: true },
    { header: 'Count', accessor: 'count', sortable: true, align: 'right' },
  ];

  const inputStyle = {
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
        title="New Drivers"
        subtitle="Newly onboarded drivers by client and project"
        action={<Btn onClick={() => navigate('/reports')}>Back to Reports</Btn>}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          style={inputStyle}
        />
        <span style={{ color: 'var(--text3)', fontSize: 13 }}>to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          style={inputStyle}
        />
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <DataTable columns={columns} data={rows} searchable />
      )}
    </div>
  );
};

export default SalesNewDrivers;
