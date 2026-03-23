import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { getPayrollSummary, getInvoiceAging, getCostPerDriver } from '../../api/reportsApi';
import { formatCurrencyFull, formatCurrency } from '../../utils/formatters';

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

const Reports = () => {
  const [period, setPeriod] = useState('Mar 2026');

  const { data: payrollData, isLoading: loadingPayroll } = useQuery({
    queryKey: ['reports-payroll', period],
    queryFn: () => getPayrollSummary({ period }),
    retry: 1,
  });

  const { data: agingData, isLoading: loadingAging } = useQuery({
    queryKey: ['reports-aging'],
    queryFn: () => getInvoiceAging(),
    retry: 1,
  });

  const { data: costData, isLoading: loadingCost } = useQuery({
    queryKey: ['reports-cost'],
    queryFn: () => getCostPerDriver(),
    retry: 1,
  });

  const payroll = payrollData?.data || fallbackPayroll;
  const aging = agingData?.data || fallbackAging;
  const costPerDriver = costData?.data || fallbackCostPerDriver;

  const isLoading = loadingPayroll || loadingAging || loadingCost;

  const tooltipStyle = {
    contentStyle: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 },
    labelStyle: { color: 'var(--text3)' },
  };

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
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
              <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ height: 30, fontSize: 12 }}>
                <option value="Mar 2026">Mar 2026</option>
                <option value="Feb 2026">Feb 2026</option>
                <option value="Jan 2026">Jan 2026</option>
              </select>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
        </>
      )}
    </div>
  );
};

export default Reports;
