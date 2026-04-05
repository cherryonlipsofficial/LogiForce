import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOpsAttendanceTracker } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';

const statusVariant = (s) => {
  if (!s) return 'default';
  switch (s) {
    case 'uploaded':
    case 'draft':
      return 'default';
    case 'pending_review':
      return 'warning';
    case 'sales_approved':
    case 'ops_approved':
      return 'info';
    case 'fully_approved':
      return 'success';
    case 'disputed':
      return 'danger';
    default:
      return 'default';
  }
};

const approvalVariant = (s) => {
  if (!s) return 'default';
  switch (s) {
    case 'approved':
      return 'success';
    case 'pending':
      return 'warning';
    case 'rejected':
      return 'danger';
    default:
      return 'default';
  }
};

const now = new Date();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

const OpsAttendanceTracker = () => {
  const navigate = useNavigate();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery({
    queryKey: ['report-ops-attendance-tracker', year, month],
    queryFn: () => getOpsAttendanceTracker({ year, month }),
  });

  const batches = data?.data?.batches || [];

  const statusCounts = batches.reduce((acc, b) => {
    const s = b.status || 'unknown';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const columns = [
    { header: 'Batch ID', accessor: 'batchId', sortable: true },
    { header: 'Project', accessor: 'projectName', sortable: true },
    { header: 'Client', accessor: 'clientName', sortable: true },
    {
      header: 'Period',
      accessor: 'period',
      sortable: false,
      render: (_val, row) => row.period ? `${row.period.month}/${row.period.year}` : '-',
    },
    {
      header: 'Status',
      accessor: 'status',
      sortable: true,
      render: (val) => (
        <Badge variant={statusVariant(val)}>{(val || '').replace(/_/g, ' ')}</Badge>
      ),
    },
    {
      header: 'Sales Approval',
      accessor: 'salesApproval',
      sortable: true,
      render: (val) => (
        <Badge variant={approvalVariant(val)}>{(val || '-').replace(/_/g, ' ')}</Badge>
      ),
    },
    {
      header: 'Ops Approval',
      accessor: 'opsApproval',
      sortable: true,
      render: (val) => (
        <Badge variant={approvalVariant(val)}>{(val || '-').replace(/_/g, ' ')}</Badge>
      ),
    },
    { header: 'Rows', accessor: 'totalRows', sortable: true, align: 'right' },
    { header: 'Uploaded By', accessor: 'uploadedBy', sortable: true },
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
        title="Attendance Tracker"
        subtitle="Attendance batch upload status and approvals"
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
            {Object.entries(statusCounts).map(([status, count]) => (
              <KpiCard key={status} label={status.replace(/_/g, ' ')} value={count} />
            ))}
            <KpiCard label="Total Batches" value={batches.length} />
          </div>

          <DataTable columns={columns} data={batches} searchable />
        </>
      )}
    </div>
  );
};

export default OpsAttendanceTracker;
