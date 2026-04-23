import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOpsSalaryPipeline } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const now = new Date();

const stageVariant = (status) => {
  switch (status) {
    case 'completed': return 'success';
    case 'in_progress': return 'info';
    case 'pending': return 'warning';
    case 'rejected': return 'danger';
    default: return 'default';
  }
};

const OpsSalaryPipeline = () => {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery({
    queryKey: ['report-ops-salary-pipeline', year, month],
    queryFn: () => getOpsSalaryPipeline({ year, month }),
  });

  const rows = data?.data || [];

  const columns = [
    { header: 'Project', accessor: 'projectName', sortable: true },
    { header: 'Client', accessor: 'clientName', sortable: true },
    { header: 'Total Drivers', accessor: 'totalDrivers', sortable: true, align: 'right' },
    {
      header: 'Stages',
      accessor: 'stages',
      render: (_val, row) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(row.stages || []).map((stage, i) => (
            <Badge key={i} variant={stageVariant(stage.status)}>
              {stage.status?.replace(/_/g, ' ')}: {stage.count} ({Number(stage.totalGross || 0).toLocaleString()})
            </Badge>
          ))}
        </div>
      ),
    },
  ];

  const selectStyle = {
    padding: '6px 10px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: 13,
  };

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Salary Pipeline"
        subtitle="Monthly salary processing stages by project"
        action={<Btn onClick={() => navigate('/reports')}>Back to Reports</Btn>}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle}>
          {[2024, 2025, 2026].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={selectStyle}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {new Date(2024, m - 1).toLocaleString('default', { month: 'long' })}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <DataTable
          columns={columns}
          data={rows}
        />
      )}
    </div>
  );
};

export default OpsSalaryPipeline;
