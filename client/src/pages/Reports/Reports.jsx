import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { getPayrollSummary, getInvoiceAging, getCostPerDriver, getFleetUtilisation } from '../../api/reportsApi';
import { getClients } from '../../api/clientsApi';
import { getProjects } from '../../api/projectsApi';
import { formatCurrencyFull, formatCurrency } from '../../utils/formatters';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const fallbackPayroll = {
  totalGross: 1764600,
  totalNet: 1509200,
  totalDeductions: 255400,
  avgCostPerDriver: 2465,
  trends: [
    { month: 'Oct 25', gross: 1680000, net: 1440000, deductions: 240000 },
    { month: 'Nov 25', gross: 1710000, net: 1462000, deductions: 248000 },
    { month: 'Dec 25', gross: 1745000, net: 1490000, deductions: 255000 },
    { month: 'Jan 26', gross: 1730000, net: 1480000, deductions: 250000 },
    { month: 'Feb 26', gross: 1752000, net: 1500000, deductions: 252000 },
    { month: 'Mar 26', gross: 1764600, net: 1509200, deductions: 255400 },
  ],
};

const fallbackAging = {
  current: 947900,
  thirtyDays: 389200,
  sixtyDays: 0,
  ninetyPlus: 0,
  buckets: [
    { name: 'Current', value: 947900, color: '#4ade80' },
    { name: '30 days', value: 389200, color: '#fbbf24' },
    { name: '60 days', value: 0, color: '#f97316' },
    { name: '90+ days', value: 0, color: '#f87171' },
  ],
};

const fallbackCostPerDriver = [
  { client: 'Amazon UAE', avgCost: 2608, driverCount: 342 },
  { client: 'Noon', avgCost: 2563, driverCount: 218 },
  { client: 'Talabat', avgCost: 2495, driverCount: 156 },
];

const COLORS = ['#4f8ef7', '#7c5ff0', '#1DB388', '#fbbf24'];

const fallbackFleetUtil = [
  { supplier: 'Al Futtaim Leasing', assigned: 180, available: 25 },
  { supplier: 'Emirates Transport', assigned: 142, available: 18 },
];

const fleetReportCards = [
  { title: 'Fleet utilisation report', desc: '% of vehicles assigned vs idle per supplier', icon: '📊' },
  { title: 'Vehicle cost per driver', desc: 'Monthly vehicle deduction by driver + client', icon: '💰' },
  { title: 'Contract expiry schedule', desc: 'All contracts with expiry dates in next 6 months', icon: '📅' },
  { title: 'Off-hire log', desc: 'History of all off-hired vehicles with termination reason', icon: '🚫' },
  { title: 'Assignment history', desc: 'Full log of which driver had which vehicle when', icon: '🔄' },
];

const periodOptions = [
  { label: 'Mar 2026', year: 2026, month: 3 },
  { label: 'Feb 2026', year: 2026, month: 2 },
  { label: 'Jan 2026', year: 2026, month: 1 },
];

const Reports = () => {
  const { isMobile, isTablet } = useBreakpoint();
  const navigate = useNavigate();
  const [periodIdx, setPeriodIdx] = useState(0);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const selected = periodOptions[periodIdx];

  const { data: clientsData } = useQuery({
    queryKey: ['reports-clients'],
    queryFn: () => getClients({ limit: 1000 }),
    staleTime: 5 * 60 * 1000,
  });
  const clients = clientsData?.data || [];

  const { data: projectsData } = useQuery({
    queryKey: ['reports-projects', selectedClientId],
    queryFn: () => getProjects({ clientId: selectedClientId }),
    enabled: !!selectedClientId,
    staleTime: 5 * 60 * 1000,
  });
  const projects = projectsData?.data || [];

  const payrollParams = { year: selected.year, month: selected.month };
  if (selectedProjectId) payrollParams.projectId = selectedProjectId;

  const { data: payrollData, isLoading: loadingPayroll } = useQuery({
    queryKey: ['reports-payroll', selected.year, selected.month, selectedProjectId],
    queryFn: () => getPayrollSummary(payrollParams),
    retry: 1,
  });

  const { data: agingData, isLoading: loadingAging } = useQuery({
    queryKey: ['reports-aging'],
    queryFn: () => getInvoiceAging(),
    retry: 1,
  });

  const { data: costData, isLoading: loadingCost } = useQuery({
    queryKey: ['reports-cost', selected.year],
    queryFn: () => getCostPerDriver({ year: selected.year }),
    retry: 1,
  });

  const { data: fleetData } = useQuery({
    queryKey: ['reports-fleet-util'],
    queryFn: () => getFleetUtilisation(),
    retry: 1,
  });

  const fleetUtil = fleetData?.data?.bySupplier
    ? fleetData.data.bySupplier.map((s) => ({ supplier: s.name, assigned: s.assigned, available: s.available }))
    : fallbackFleetUtil;

  // Backend returns array of {clientName, totalGross, totalNet, totalDeductions, driverCount}
  // Aggregate into summary for KPI cards
  const payrollRaw = payrollData?.data;
  const payroll = payrollRaw && payrollRaw.length > 0
    ? {
        totalGross: payrollRaw.reduce((s, r) => s + (r.totalGross || 0), 0),
        totalNet: payrollRaw.reduce((s, r) => s + (r.totalNet || 0), 0),
        totalDeductions: payrollRaw.reduce((s, r) => s + (r.totalDeductions || 0), 0),
        avgCostPerDriver: Math.round(
          payrollRaw.reduce((s, r) => s + (r.totalGross || 0), 0) /
          Math.max(1, payrollRaw.reduce((s, r) => s + (r.driverCount || 0), 0))
        ),
        trends: fallbackPayroll.trends,
      }
    : fallbackPayroll;

  // Backend returns {current_0_30, overdue_31_60, overdue_61_90, overdue_90_plus} buckets
  const agingRaw = agingData?.data;
  const aging = agingRaw
    ? {
        buckets: [
          { name: 'Current', value: agingRaw.current_0_30?.total || 0, color: '#4ade80' },
          { name: '31-60 days', value: agingRaw.overdue_31_60?.total || 0, color: '#fbbf24' },
          { name: '61-90 days', value: agingRaw.overdue_61_90?.total || 0, color: '#f97316' },
          { name: '90+ days', value: agingRaw.overdue_90_plus?.total || 0, color: '#f87171' },
        ],
      }
    : fallbackAging;

  // Backend returns array of {clientName, avgCostPerDriver, driverCount, totalCost}
  const costRaw = costData?.data;
  const costPerDriver = costRaw && costRaw.length > 0
    ? costRaw.map((c) => ({ client: c.clientName, avgCost: c.avgCostPerDriver, driverCount: c.driverCount }))
    : fallbackCostPerDriver;

  const isLoading = loadingPayroll || loadingAging || loadingCost;

  const tooltipStyle = {
    contentStyle: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 },
    labelStyle: { color: 'var(--text3)' },
  };

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Gross payroll" value={formatCurrency(payroll.totalGross)} />
        <KpiCard label="Net payout" value={formatCurrency(payroll.totalNet)} color="#4ade80" />
        <KpiCard label="Total deductions" value={formatCurrency(payroll.totalDeductions)} color="#f87171" />
        <KpiCard label="Avg cost/driver" value={formatCurrencyFull(payroll.avgCostPerDriver)} />
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* Payroll trend */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Payroll trend (6 months)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={selectedClientId}
                  onChange={(e) => { setSelectedClientId(e.target.value); setSelectedProjectId(''); }}
                  style={{ height: 30, fontSize: 12 }}
                >
                  <option value="">All clients</option>
                  {clients.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
                {selectedClientId && (
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    style={{ height: 30, fontSize: 12 }}
                  >
                    <option value="">All projects</option>
                    {projects.map((p) => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                )}
                <select value={periodIdx} onChange={(e) => setPeriodIdx(Number(e.target.value))} style={{ height: 30, fontSize: 12 }}>
                  {periodOptions.map((p, i) => (
                    <option key={p.label} value={i}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={payroll.trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip {...tooltipStyle} formatter={(v) => formatCurrencyFull(v)} />
                <Area type="monotone" dataKey="gross" stroke="#4f8ef7" fill="rgba(79,142,247,0.15)" strokeWidth={2} />
                <Area type="monotone" dataKey="net" stroke="#4ade80" fill="rgba(74,222,128,0.1)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            {/* Invoice aging */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Invoice aging</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={aging.buckets.filter((b) => b.value > 0)} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${formatCurrency(value)}`}>
                    {aging.buckets.filter((b) => b.value > 0).map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={(v) => formatCurrencyFull(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
                {aging.buckets.map((b) => (
                  <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text3)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.color, display: 'inline-block' }} />
                    {b.name}
                  </div>
                ))}
              </div>
            </div>

            {/* Cost per driver by client */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Cost per driver by client</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={costPerDriver}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="client" tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} formatter={(v) => formatCurrencyFull(v)} />
                  <Bar dataKey="avgCost" fill="#7c5ff0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 12 }}>
                {costPerDriver.map((c) => (
                  <div key={c.client} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <span>{c.client}</span>
                    <span style={{ display: 'flex', gap: 12 }}>
                      <span style={{ color: 'var(--text3)' }}>{c.driverCount} drivers</span>
                      <span style={{ fontFamily: 'var(--mono)', color: '#a78bfa' }}>{formatCurrencyFull(c.avgCost)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Vehicle & fleet reports section */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Vehicle &amp; fleet reports</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              {fleetReportCards.map((card) => (
                <div
                  key={card.title}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '16px 18px',
                    cursor: 'pointer',
                    transition: 'border-color .15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{card.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>{card.desc}</div>
                </div>
              ))}
            </div>

            {/* Fleet utilisation chart */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Fleet utilisation by supplier</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={fleetUtil} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="supplier" tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="assigned" name="Assigned" fill="#4f8ef7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="available" name="Available" fill="#1DB388" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text3)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#4f8ef7', display: 'inline-block' }} />
                  Assigned
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text3)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#1DB388', display: 'inline-block' }} />
                  Available
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Reports;
