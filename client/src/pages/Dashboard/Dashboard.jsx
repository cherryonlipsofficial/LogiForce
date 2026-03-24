import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import toast from 'react-hot-toast';
import Card from '../../components/ui/Card';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import StatusBadge from '../../components/ui/StatusBadge';
import SectionHeader from '../../components/ui/SectionHeader';
import Btn from '../../components/ui/Btn';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { getPayrollSummary, getFleetUtilisation } from '../../api/reportsApi';
import { getInvoices } from '../../api/invoicesApi';
import { useNavigate } from 'react-router-dom';

const fallbackTrend = [
  { month: 'Oct', gross: 2950000, net: 2540000, deductions: 410000 },
  { month: 'Nov', gross: 3010000, net: 2590000, deductions: 420000 },
  { month: 'Dec', gross: 3180000, net: 2740000, deductions: 440000 },
  { month: 'Jan', gross: 3050000, net: 2620000, deductions: 430000 },
  { month: 'Feb', gross: 3080000, net: 2680000, deductions: 400000 },
  { month: 'Mar', gross: 3200000, net: 2790000, deductions: 410000 },
];

const fallbackDeductions = [
  { name: 'Vehicle rental', value: 182000, color: '#BA7517' },
  { name: 'Salik tolls', value: 51000, color: '#378ADD' },
  { name: 'SIM charges', value: 68000, color: '#1DB388' },
  { name: 'Advance recovery', value: 63000, color: '#D85A30' },
  { name: 'Penalties', value: 46000, color: '#E24B4A' },
];

const fallbackInvoices = [
  { id: 'INV-2026-03-001', client: 'Amazon UAE', total: 1932000, status: 'sent' },
  { id: 'INV-2026-03-002', client: 'Noon', total: 1018500, status: 'draft' },
  { id: 'INV-2026-02-001', client: 'Amazon UAE', total: 1922382, status: 'paid' },
  { id: 'INV-2026-02-002', client: 'Noon', total: 1012234, status: 'overdue' },
];

const fallbackAlerts = [
  { name: 'Ali Hassan', issue: '0 days recorded' },
  { name: 'Raj Kumar', issue: 'Missing 3 days' },
  { name: 'James Okafor', issue: 'Suspended' },
];

const fallbackFleet = [
  { name: 'Al Futtaim Leasing', assigned: 180, available: 25, maintenance: 8, offHired: 12, total: 225 },
  { name: 'Emirates Transport', assigned: 142, available: 18, maintenance: 5, offHired: 7, total: 172 },
];

const fallbackContractAlerts = [
  { plate: 'DXB A 12345', daysRemaining: 5 },
  { plate: 'DXB B 67890', daysRemaining: 12 },
  { plate: 'AUH C 11223', daysRemaining: 18 },
  { plate: 'SHJ D 44556', daysRemaining: 24 },
  { plate: 'DXB E 78901', daysRemaining: 29 },
];

const FLEET_COLORS = {
  assigned: '#4ade80',
  available: '#4f8ef7',
  maintenance: '#fbbf24',
  offHired: '#f87171',
};

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border2)',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 12,
      }}
    >
      <div style={{ color: 'var(--text3)', marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}:{' '}
          <strong>
            AED{' '}
            {p.value >= 1000000
              ? (p.value / 1000000).toFixed(1) + 'M'
              : (p.value / 1000).toFixed(0) + 'K'}
          </strong>
        </div>
      ))}
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const now = new Date();
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['payrollSummary', now.getFullYear(), now.getMonth() + 1],
    queryFn: () => getPayrollSummary({ year: now.getFullYear(), month: now.getMonth() + 1 }),
    retry: 1,
    onError: () => toast.error('Failed to load payroll summary'),
  });

  const { data: invoiceData, isLoading: invoiceLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => getInvoices({ limit: 5 }),
    retry: 1,
    onError: () => toast.error('Failed to load invoices'),
  });

  const { data: fleetData } = useQuery({
    queryKey: ['fleetUtilisation'],
    queryFn: () => getFleetUtilisation(),
    retry: 1,
  });

  const fleetSuppliers = fleetData?.data?.bySupplier || fallbackFleet;

  // Contract alerts: suppliers with contractEnd within 30 days — derive from fleet or use fallback
  const contractAlerts = fallbackContractAlerts;

  const trend = summaryData?.data?.trend || fallbackTrend;
  const deductions = summaryData?.data?.deductions || fallbackDeductions;
  const invoices = invoiceData?.data || fallbackInvoices;
  const alerts = summaryData?.data?.alerts || fallbackAlerts;
  const total = deductions.reduce((a, b) => a + b.value, 0);

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Alert banner */}
      <div
        style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 'var(--radius-lg)',
          padding: '11px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 12,
          color: '#f87171',
        }}
      >
        <span style={{ fontSize: 16 }}>&#x26A0;</span>
        <span>
          <strong>Action required:</strong> 9 attendance errors, 1 overdue
          invoice (Noon — AED 1.01M), 2 drivers with visa expiry within 30
          days.
        </span>
        <Btn small variant="danger" style={{ marginLeft: 'auto', flexShrink: 0 }}>
          Review alerts
        </Btn>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Gross payroll" value="AED 3.2M" sub="+4.1% vs Feb" />
        <KpiCard label="Total deductions" value="AED 410K" sub="-2.3% vs Feb" color="#fbbf24" />
        <KpiCard label="Net payout" value="AED 2.79M" sub="1,240 active drivers" color="#4ade80" />
        <KpiCard label="Outstanding invoices" value="AED 640K" sub="3 pending · 1 overdue" color="#f87171" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        <Card>
          <SectionHeader title="6-month payroll trend" />
          {summaryLoading ? (
            <LoadingSpinner />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trend} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f8ef7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4f8ef7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="nG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1DB388" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1DB388" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fill: '#555c70', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => (v / 1000000).toFixed(1) + 'M'} tick={{ fill: '#555c70', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="gross" name="Gross" stroke="#4f8ef7" strokeWidth={2} fill="url(#gG)" />
                <Area type="monotone" dataKey="net" name="Net" stroke="#1DB388" strokeWidth={2} fill="url(#nG)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card>
          <SectionHeader title="Deduction breakdown — Mar" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            {deductions.map((d) => {
              const pct = Math.round((d.value / total) * 100);
              return (
                <div key={d.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: 'var(--text2)' }}>{d.name}</span>
                    <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                      AED {(d.value / 1000).toFixed(0)}K
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'var(--surface3)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: pct + '%', height: '100%', background: d.color, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <Card>
          <SectionHeader title="Payroll by client" />
          {[
            { name: 'Amazon UAE', value: 1840000, pct: 72, color: '#4f8ef7' },
            { name: 'Noon', value: 970000, pct: 38, color: '#1DB388' },
            { name: 'Talabat', value: 390000, pct: 15, color: '#7c5ff0' },
            { name: 'Others', value: 130000, pct: 5, color: '#555c70' },
          ].map((c) => (
            <div key={c.name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--text2)' }}>{c.name}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                  AED {(c.value / 1000000).toFixed(2)}M
                </span>
              </div>
              <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: c.pct + '%', height: '100%', background: c.color, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </Card>
        <Card>
          <SectionHeader title="Attendance alerts" action={<Badge variant="danger">9 errors</Badge>} />
          <table style={{ width: '100%' }}>
            <tbody>
              {alerts.map((a, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 0', fontSize: 12, color: 'var(--text2)' }}>{a.name}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>
                    <Badge variant="danger">{a.issue}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <SectionHeader title="Invoice status" />
          <table style={{ width: '100%' }}>
            <tbody>
              {invoices.slice(0, 4).map((inv, i) => (
                <tr key={inv.id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 0' }}>
                    <div style={{ fontSize: 12 }}>{inv.client}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                      AED {((inv.total || 0) / 1000).toFixed(0)}K
                    </div>
                  </td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>
                    <StatusBadge status={inv.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Fleet at a glance row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Card>
          <SectionHeader title="Fleet at a glance" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
            {fleetSuppliers.map((sup) => {
              const total = sup.total || (sup.assigned + sup.available + sup.maintenance + sup.offHired);
              return (
                <div key={sup.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text2)', fontWeight: 500 }}>{sup.name}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
                      {total} vehicles
                    </span>
                  </div>
                  <div style={{ display: 'flex', height: 20, borderRadius: 4, overflow: 'hidden', background: 'var(--surface3)' }}>
                    {[
                      { key: 'assigned', value: sup.assigned, color: FLEET_COLORS.assigned },
                      { key: 'available', value: sup.available, color: FLEET_COLORS.available },
                      { key: 'maintenance', value: sup.maintenance, color: FLEET_COLORS.maintenance },
                      { key: 'offHired', value: sup.offHired, color: FLEET_COLORS.offHired },
                    ].map((seg) =>
                      seg.value > 0 ? (
                        <div
                          key={seg.key}
                          title={`${seg.key}: ${seg.value}`}
                          style={{
                            width: `${(seg.value / total) * 100}%`,
                            background: seg.color,
                            height: '100%',
                            transition: 'width .3s',
                          }}
                        />
                      ) : null
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    {[
                      { label: 'Assigned', value: sup.assigned, color: FLEET_COLORS.assigned },
                      { label: 'Available', value: sup.available, color: FLEET_COLORS.available },
                      { label: 'Maintenance', value: sup.maintenance, color: FLEET_COLORS.maintenance },
                      { label: 'Off-hired', value: sup.offHired, color: FLEET_COLORS.offHired },
                    ].map((item) => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text3)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
                        {item.label}: {item.value}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <SectionHeader title="Contract alerts" action={<Badge variant="warning">{contractAlerts.length} expiring</Badge>} />
          <table style={{ width: '100%' }}>
            <tbody>
              {contractAlerts.slice(0, 5).map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 0', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)' }}>{c.plate}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>
                    <Badge variant={c.daysRemaining <= 7 ? 'danger' : c.daysRemaining <= 14 ? 'warning' : 'info'}>
                      {c.daysRemaining}d
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8 }}>
            <Btn small variant="ghost" onClick={() => navigate('/vehicles')}>View all →</Btn>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
