import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import toast from 'react-hot-toast';
import Card from '../../components/ui/Card';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import StatusBadge from '../../components/ui/StatusBadge';
import SectionHeader from '../../components/ui/SectionHeader';
import DataTable from '../../components/ui/DataTable';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PermissionGate from '../../components/ui/PermissionGate';
import { useAuth } from '../../context/AuthContext';
import {
  getDrivers,
  getExpiringDocumentsByType,
  getDriverHistorySummary,
  getDriverDocuments,
} from '../../api/driversApi';
import { getGuaranteePassports } from '../../api/guaranteePassportApi';

const DOC_TYPE_LABELS = {
  emirates_id: 'Emirates ID',
  driving_licence: 'Driving Licence',
  visa: 'Residency Visa',
  passport: 'Passport',
  labour_card: 'Labour Card',
  mulkiya: 'Mulkiya',
  other: 'Other',
};

const DOC_TYPE_COLORS = {
  emirates_id: '#4f8ef7',
  driving_licence: '#1DB388',
  visa: '#a78bfa',
  passport: '#fbbf24',
  labour_card: '#f97316',
  mulkiya: '#60a5fa',
  other: '#555c70',
};

const REQUIRED_DOC_TYPES = ['emirates_id', 'passport', 'driving_licence', 'visa'];

const STATUS_LABELS = {
  active: 'Activated',
  suspended: 'Suspended',
  on_leave: 'Put on leave',
  resigned: 'Resigned',
  offboarded: 'Offboarded',
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
      <div style={{ color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.fill || p.color, fontWeight: 600 }}>
          {p.value} documents
        </div>
      ))}
    </div>
  );
};

const ComplianceDashboard = () => {
  const { hasPermission } = useAuth();

  // --- Data fetching ---

  // Expiring documents (7-day and 30-day)
  const { data: expiring7Data } = useQuery({
    queryKey: ['expiring-docs-7'],
    queryFn: () => getExpiringDocumentsByType(7),
    retry: 1,
    onError: () => toast.error('Failed to load 7-day expiry data'),
  });

  const { data: expiring30Data, isLoading: expiring30Loading } = useQuery({
    queryKey: ['expiring-docs-30'],
    queryFn: () => getExpiringDocumentsByType(30),
    retry: 1,
    onError: () => toast.error('Failed to load 30-day expiry data'),
  });

  // Pending verification drivers
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['drivers-pending-verify'],
    queryFn: () => getDrivers({ status: 'pending_verification', limit: 200 }),
    retry: 1,
    onError: () => toast.error('Failed to load pending drivers'),
  });

  // Guarantee passports
  const { data: gpData } = useQuery({
    queryKey: ['guarantee-passports-all'],
    queryFn: () => getGuaranteePassports(),
    retry: 1,
    onError: () => toast.error('Failed to load guarantee passports'),
  });

  // History summary (last 30 days)
  const { data: historyData } = useQuery({
    queryKey: ['driver-history-summary-30'],
    queryFn: () => getDriverHistorySummary(30),
    retry: 1,
    onError: () => toast.error('Failed to load history summary'),
  });

  // --- Derived data ---

  const expiring7 = expiring7Data?.data || [];
  const expiring30 = expiring30Data?.data || [];
  const pendingDrivers = pendingData?.data || [];
  const guaranteePassports = gpData?.data || [];
  const historySummary = historyData?.data || [];

  const totalExpiring7 = expiring7.reduce((sum, d) => sum + d.count, 0);
  const totalExpiring30 = expiring30.reduce((sum, d) => sum + d.count, 0);
  const pendingCount = pendingData?.total || pendingDrivers.length;

  // Passport tracker counts
  const passportSubmitted = pendingDrivers.filter(
    (d) => d.isPassportSubmitted && d.passportSubmissionType === 'own'
  ).length;

  const gpActive = guaranteePassports.filter(
    (g) => g.status === 'active' || g.status === 'extended'
  ).length;
  const gpExtensionRequested = guaranteePassports.filter(
    (g) => g.extensionRequest?.status === 'pending'
  ).length;
  const gpReturned = guaranteePassports.filter(
    (g) => g.status === 'returned'
  ).length;

  // Chart data for document expiry breakdown
  const chartData = expiring30
    .filter((d) => REQUIRED_DOC_TYPES.includes(d.docType) || d.count > 0)
    .map((d) => ({
      name: DOC_TYPE_LABELS[d.docType] || d.docType,
      count: d.count,
      docType: d.docType,
    }))
    .sort((a, b) => b.count - a.count);

  // Pending activations table columns
  const pendingColumns = [
    {
      header: 'Driver',
      accessor: 'fullName',
      sortable: true,
      render: (row) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{row.fullName}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            {row.employeeCode || '—'}
          </div>
        </div>
      ),
    },
    {
      header: 'Docs uploaded',
      accessor: '_docCount',
      sortable: true,
      render: (row) => (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
          {row._docCount ?? '—'}
        </span>
      ),
    },
    {
      header: 'Missing docs',
      accessor: '_missingDocs',
      render: (row) => {
        const missing = row._missingDocs || [];
        if (missing.length === 0) return <span style={{ fontSize: 12, color: 'var(--text3)' }}>None</span>;
        return (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {missing.map((t) => (
              <Badge key={t} variant="danger" style={{ fontSize: 10 }}>
                {DOC_TYPE_LABELS[t] || t}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      header: 'Status',
      accessor: '_readyStatus',
      render: (row) => {
        const ready = !row._missingDocs || row._missingDocs.length === 0;
        return ready ? (
          <Badge variant="success">Ready to activate</Badge>
        ) : (
          <Badge variant="danger">Doc missing</Badge>
        );
      },
    },
  ];

  // Fetch documents for each pending driver to determine missing docs
  const pendingDriverIds = pendingDrivers.map((d) => d._id);
  const docQueries = useQuery({
    queryKey: ['pending-driver-docs', pendingDriverIds],
    queryFn: async () => {
      if (pendingDriverIds.length === 0) return {};
      const results = {};
      await Promise.all(
        pendingDriverIds.map(async (id) => {
          try {
            const res = await getDriverDocuments(id);
            results[id] = res.data || [];
          } catch {
            results[id] = [];
          }
        })
      );
      return results;
    },
    enabled: pendingDriverIds.length > 0,
    retry: 1,
  });

  const driverDocsMap = docQueries.data || {};

  const enrichedPendingDrivers = pendingDrivers.map((d) => {
    const docs = driverDocsMap[d._id] || [];
    const uploadedTypes = docs.map((doc) => doc.docType);
    const missingDocs = REQUIRED_DOC_TYPES.filter((t) => !uploadedTypes.includes(t));
    return {
      ...d,
      _docCount: docs.length,
      _missingDocs: missingDocs,
    };
  });

  // History summary mapped
  const historyRows = [
    { label: 'Activated', status: 'active' },
    { label: 'Suspended', status: 'suspended' },
    { label: 'Put on leave', status: 'on_leave' },
    { label: 'Returned from leave', status: 'active' },
  ];

  const getHistoryCount = (statusTo) => {
    const entry = historySummary.find((h) => h.status === statusTo);
    return entry?.count || 0;
  };

  return (
    <PermissionGate permission="drivers.view" fallback={<div style={{ padding: 40, color: 'var(--text3)' }}>No access</div>}>
      <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Section 1: KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          <KpiCard
            label="Expiring in 7 days"
            value={String(totalExpiring7)}
            sub="Urgent — review immediately"
            color="var(--danger, #f87171)"
          />
          <KpiCard
            label="Expiring in 30 days"
            value={String(totalExpiring30)}
            sub="Documents nearing expiry"
            color="#fbbf24"
          />
          <KpiCard
            label="Pending activation"
            value={String(pendingCount)}
            sub="Drivers in pending_verification"
            color="#a78bfa"
          />
          <KpiCard
            label="Passports held"
            value={String(passportSubmitted)}
            sub="Submitted to authority"
            color="#4f8ef7"
          />
          <KpiCard
            label="Active guarantees"
            value={String(gpActive)}
            sub="Guarantee passports"
            color="#1DB388"
          />
        </div>

        {/* Section 2: Document expiry breakdown chart */}
        <Card>
          <SectionHeader
            title="Document expiry breakdown (next 30 days)"
            action={
              totalExpiring7 > 0 ? (
                <Badge variant="danger">{totalExpiring7} urgent (≤7d)</Badge>
              ) : null
            }
          />
          {expiring30Loading ? (
            <LoadingSpinner />
          ) : chartData.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: '20px 0' }}>
              No documents expiring in the next 30 days.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 50)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 30, bottom: 0, left: 10 }}>
                <XAxis type="number" tick={{ fill: '#555c70', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fill: 'var(--text2)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
                  {chartData.map((entry) => (
                    <Cell key={entry.docType} fill={DOC_TYPE_COLORS[entry.docType] || '#555c70'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Section 3: Pending activations queue */}
        <PermissionGate permission="drivers.view">
          <Card>
            <SectionHeader
              title="Pending activations queue"
              action={<Badge variant="purple">{pendingCount} drivers</Badge>}
            />
            {pendingLoading ? (
              <LoadingSpinner />
            ) : (
              <DataTable
                columns={pendingColumns}
                data={enrichedPendingDrivers}
                pageSize={10}
                searchable
                searchPlaceholder="Search pending drivers..."
                emptyMessage="No drivers pending activation"
              />
            )}
          </Card>
        </PermissionGate>

        {/* Section 4: Two side-by-side cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Passport submission tracker */}
          <PermissionGate permission="drivers.manage_passport">
            <Card>
              <SectionHeader title="Passport submission tracker" />
              <table style={{ width: '100%' }}>
                <tbody>
                  {[
                    { label: 'Submitted to authority', value: passportSubmitted, variant: 'info' },
                    { label: 'Awaiting collection', value: gpReturned, variant: 'warning' },
                    { label: 'Extension requested', value: gpExtensionRequested, variant: 'warning' },
                    { label: 'Guaranteed (active)', value: gpActive, variant: 'success' },
                  ].map((row) => (
                    <tr key={row.label} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 0', fontSize: 13, color: 'var(--text2)' }}>
                        {row.label}
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'right' }}>
                        <Badge variant={row.variant}>
                          {row.value}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </PermissionGate>

          {/* Status change log */}
          <PermissionGate permission="drivers.view">
            <Card>
              <SectionHeader title="Status changes (last 30 days)" />
              <table style={{ width: '100%' }}>
                <tbody>
                  {[
                    { label: 'Activated', statusTo: 'active', variant: 'success' },
                    { label: 'Suspended', statusTo: 'suspended', variant: 'danger' },
                    { label: 'Put on leave', statusTo: 'on_leave', variant: 'warning' },
                    { label: 'Returned from leave', statusTo: 'active', variant: 'info', note: '(to active)' },
                  ].map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 0', fontSize: 13, color: 'var(--text2)' }}>
                        {row.label}
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'right' }}>
                        <Badge variant={row.variant}>
                          {getHistoryCount(row.statusTo)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </PermissionGate>
        </div>
      </div>
    </PermissionGate>
  );
};

export default ComplianceDashboard;
