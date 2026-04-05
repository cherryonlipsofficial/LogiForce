import { useQuery } from '@tanstack/react-query';
import { getOpsDriverAvailability } from '../../api/reportsApi';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const STATUS_COLORS = {
  active: '#4ade80',
  draft: '#94a3b8',
  pending_kyc: '#fbbf24',
  pending_verification: '#f97316',
  on_leave: '#7c5ff0',
  suspended: '#f87171',
  resigned: '#ef4444',
  offboarded: '#6b7280',
};

const OpsDriverAvailability = () => {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();

  const { data, isLoading } = useQuery({
    queryKey: ['report-ops-driver-availability'],
    queryFn: () => getOpsDriverAvailability(),
  });

  const rows = data?.data || [];

  const chartData = rows.map(r => {
    const obj = { project: r.projectName || 'Unassigned' };
    for (const s of r.statuses) obj[s.status] = s.count;
    return obj;
  });

  const allStatuses = [...new Set(rows.flatMap(r => r.statuses.map(s => s.status)))];

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Driver Availability"
        subtitle="Driver count by status per project"
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
                {allStatuses.map(s => (
                  <Bar key={s} dataKey={s} stackId="a" fill={STATUS_COLORS[s] || '#94a3b8'} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 500 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Project</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                    <th style={thStyle}>Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.projectId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>{r.projectName || 'Unassigned'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{r.total}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {r.statuses.map(s => (
                            <Badge key={s.status} variant={s.status === 'active' ? 'success' : s.status === 'suspended' ? 'danger' : s.status === 'pending_kyc' || s.status === 'pending_verification' ? 'warning' : 'default'}>
                              {s.status.replace(/_/g, ' ')}: {s.count}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const thStyle = { padding: '9px 14px', fontSize: 11, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', background: 'var(--surface2)', whiteSpace: 'nowrap' };
const tdStyle = { padding: '11px 14px', fontSize: 13, color: 'var(--text)' };

export default OpsDriverAvailability;
