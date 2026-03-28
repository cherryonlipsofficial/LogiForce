import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import Card from '../../components/ui/Card';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import StatusBadge from '../../components/ui/StatusBadge';
import SectionHeader from '../../components/ui/SectionHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PermissionGate from '../../components/ui/PermissionGate';
import { getMyDrivers } from '../../api/driversApi';
import { getProjects } from '../../api/projectsApi';
import { getClients } from '../../api/clientsApi';
import { useAuth } from '../../context/AuthContext';

const tooltipStyle = {
  contentStyle: {
    background: 'var(--surface2)',
    border: '1px solid var(--border2)',
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: 'var(--text3)' },
};

const SalesDashboard = () => {
  const { user } = useAuth();

  // Fetch all drivers created by the current user (up to 500 for client-side aggregation)
  const { data: driversData, isLoading: driversLoading } = useQuery({
    queryKey: ['my-drivers'],
    queryFn: () => getMyDrivers({ limit: 500 }),
    retry: 1,
  });

  // Fetch active projects
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['projects-active'],
    queryFn: () => getProjects({ status: 'active', limit: 200 }),
    retry: 1,
  });

  // Fetch clients for count
  const { data: clientsData } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => getClients({ limit: 200 }),
    retry: 1,
  });

  const drivers = driversData?.data || [];
  const projects = projectsData?.data || [];
  const clients = clientsData?.data || [];

  // ── KPI calculations ──
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const driversThisMonth = useMemo(
    () => drivers.filter((d) => {
      const created = new Date(d.createdAt);
      return created.getMonth() === thisMonth && created.getFullYear() === thisYear;
    }),
    [drivers, thisMonth, thisYear]
  );

  const activatedThisMonth = useMemo(
    () => driversThisMonth.filter((d) => d.status === 'active'),
    [driversThisMonth]
  );

  const conversionRate = driversThisMonth.length > 0
    ? Math.round((activatedThisMonth.length / driversThisMonth.length) * 100)
    : 0;

  const activeClients = useMemo(
    () => clients.filter((c) => c.status === 'active' || !c.status),
    [clients]
  );

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === 'active'),
    [projects]
  );

  // ── Month-over-month chart data (last 6 months) ──
  const chartData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(thisYear, thisMonth - i, 1);
      months.push({
        month: d.toLocaleString('en', { month: 'short' }),
        m: d.getMonth(),
        y: d.getFullYear(),
        count: 0,
      });
    }
    drivers.forEach((drv) => {
      const created = new Date(drv.createdAt);
      const entry = months.find((m) => m.m === created.getMonth() && m.y === created.getFullYear());
      if (entry) entry.count++;
    });
    return months.map(({ month, count }) => ({ month, count }));
  }, [drivers, thisMonth, thisYear]);

  // ── Recent submissions (last 10) ──
  const recentDrivers = useMemo(
    () => [...drivers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10),
    [drivers]
  );

  // ── Open project slots ──
  const openSlots = useMemo(
    () =>
      activeProjects
        .map((p) => {
          const current = p.driverCount ?? 0;
          const planned = p.plannedDriverCount ?? 0;
          const available = Math.max(0, planned - current);
          return {
            _id: p._id,
            name: p.name,
            clientName: p.clientId?.name || '—',
            available,
            planned,
            current,
          };
        })
        .filter((p) => p.available > 0),
    [activeProjects]
  );

  const isLoading = driversLoading || projectsLoading;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPI row */}
      <PermissionGate anyOf={['drivers.view', 'clients.view', 'projects.view']}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
          <KpiCard
            label="Drivers added this month"
            value={String(driversThisMonth.length)}
            sub={`Total: ${drivers.length}`}
          />
          <KpiCard
            label="Drivers activated this month"
            value={String(activatedThisMonth.length)}
            sub="Activated from your submissions"
            color="#4ade80"
          />
          <KpiCard
            label="Conversion rate"
            value={`${conversionRate}%`}
            sub="Activated / added"
            color="#4f8ef7"
          />
          <KpiCard
            label="Active clients"
            value={String(activeClients.length)}
            sub="Across all projects"
            color="#7c5ff0"
          />
          <KpiCard
            label="Active projects"
            value={String(activeProjects.length)}
            sub={`${openSlots.length} with open slots`}
            color="#1DB388"
          />
        </div>
      </PermissionGate>

      {/* Chart — month-over-month driver additions */}
      <PermissionGate permission="drivers.view">
        <Card>
          <SectionHeader title="Driver additions — last 6 months" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text3)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" name="Drivers added" fill="#4f8ef7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </PermissionGate>

      {/* Bottom row — submissions table + open slots */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        {/* My recent submissions */}
        <PermissionGate permission="drivers.view">
          <Card>
            <SectionHeader title="My recent submissions" action={<Badge variant="info">{recentDrivers.length}</Badge>} />
            {recentDrivers.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', padding: '12px 0' }}>No drivers submitted yet</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                    <th style={{ padding: '8px 0', textAlign: 'left', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</th>
                    <th style={{ padding: '8px 0', textAlign: 'left', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</th>
                    <th style={{ padding: '8px 0', textAlign: 'left', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Project</th>
                    <th style={{ padding: '8px 0', textAlign: 'right', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Date added</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDrivers.map((drv) => (
                    <tr key={drv._id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0', fontSize: 12 }}>{drv.fullName || '—'}</td>
                      <td style={{ padding: '8px 0' }}><StatusBadge status={drv.status} /></td>
                      <td style={{ padding: '8px 0', fontSize: 12, color: 'var(--text2)' }}>{drv.projectId?.name || '—'}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                        {new Date(drv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </PermissionGate>

        {/* Open project slots */}
        <PermissionGate permission="projects.view">
          <Card>
            <SectionHeader title="Open project slots" action={<Badge variant="success">{openSlots.length} projects</Badge>} />
            {openSlots.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', padding: '12px 0' }}>All projects fully staffed</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {openSlots.map((proj) => (
                    <tr key={proj._id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 0' }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{proj.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>{proj.clientName}</div>
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'right' }}>
                        <Badge variant={proj.available >= 5 ? 'success' : 'warning'}>
                          {proj.available} slot{proj.available !== 1 ? 's' : ''}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </PermissionGate>
      </div>
    </div>
  );
};

export default SalesDashboard;
