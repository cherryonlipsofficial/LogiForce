import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import { useAuth } from '../../context/AuthContext';
import { useFormatters } from '../../hooks/useFormatters';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { formatDate } from '../../utils/formatters';
import { getDriverVisas } from '../../api/driverVisasApi';
import DriverVisaStatement from './DriverVisaStatement';
import CreateDriverVisaModal from './CreateDriverVisaModal';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'fully_recovered', label: 'Recovered' },
  { value: 'waived', label: 'Waived' },
  { value: 'cancelled', label: 'Cancelled' },
];

const statusVariant = {
  active: 'success',
  fully_recovered: 'info',
  waived: 'default',
  cancelled: 'danger',
};

const fmt2 = (n) => {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const expiryBadge = (days, expiryDate) => {
  if (!expiryDate) return null;
  if (days == null) return null;
  if (days < 0) return <Badge variant="danger">Expired ({Math.abs(days)}d)</Badge>;
  if (days <= 30) return <Badge variant="warning">Expiring in {days}d</Badge>;
  if (days <= 60) return <Badge variant="default">{days}d</Badge>;
  return null;
};

const processingBadge = (visa) => {
  if (visa.visaProcessedDate) {
    return (
      <Badge variant="success" title={`Processed ${formatDate(visa.visaProcessedDate)}`}>
        ✓ Processed
      </Badge>
    );
  }
  return <Badge variant="warning">Pending</Badge>;
};

const DriverVisas = () => {
  const { hasPermission } = useAuth();
  const { n } = useFormatters();
  const { isMobile, isTablet } = useBreakpoint();

  const [tab, setTab] = useState('active');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedVisaId, setSelectedVisaId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const queryParams = useMemo(() => {
    const p = { page, limit: 20 };
    if (tab === 'active') p.status = 'active';
    else if (tab === 'expiring') {
      p.status = 'active';
      p.expiringInDays = 60;
    } else if (tab === 'unprocessed') {
      p.status = 'active';
      p.unprocessed = true;
    } else if (tab === 'all' && statusFilter !== 'all') {
      p.status = statusFilter;
    }
    return p;
  }, [tab, statusFilter, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['driver-visas', queryParams],
    queryFn: () => getDriverVisas(queryParams),
    retry: 1,
  });

  const visas = data?.data || [];
  const pagination = data?.pagination;

  const kpis = useMemo(() => {
    return {
      active: visas.filter((v) => v.status === 'active').length,
      expiring: visas.filter(
        (v) => v.status === 'active' && v.daysUntilExpiry != null && v.daysUntilExpiry >= 0 && v.daysUntilExpiry <= 30
      ).length,
      unprocessed: visas.filter((v) => v.status === 'active' && !v.visaProcessedDate).length,
      outstanding: Math.round(
        visas.reduce((s, v) => s + (Number(v.outstandingAmount) || 0), 0) * 100
      ) / 100,
    };
  }, [visas]);

  const tabs = [
    { key: 'active', label: 'Active' },
    { key: 'expiring', label: 'Expiring soon' },
    { key: 'unprocessed', label: 'Unprocessed' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)',
          gap: 12,
        }}
      >
        <KpiCard label="Active visas" value={kpis.active} color="#4ade80" />
        <KpiCard label="Expiring (30d)" value={kpis.expiring} color="#f59e0b" />
        <KpiCard label="Not yet processed" value={kpis.unprocessed} color="#fbbf24" />
        <KpiCard label="Outstanding (AED)" value={n(fmt2(kpis.outstanding))} color="#3b82f6" />
      </div>

      {hasPermission('driver_visas.create') && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Btn variant="primary" onClick={() => setShowCreate(true)}>
            + Add visa record
          </Btn>
        </div>
      )}

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              style={{
                padding: '12px 20px',
                fontSize: 13,
                fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? 'var(--accent)' : 'var(--text3)',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
          {tab === 'all' && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, padding: '0 14px' }}>
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => { setStatusFilter(f.value); setPage(1); }}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 500,
                    border: '1px solid',
                    borderColor: statusFilter === f.value ? 'var(--accent)' : 'var(--border2)',
                    background: statusFilter === f.value ? 'rgba(79,142,247,0.1)' : 'transparent',
                    color: statusFilter === f.value ? 'var(--accent)' : 'var(--text3)',
                    cursor: 'pointer',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : visas.length === 0 ? (
          <EmptyState title="No visa records" message="No records match the current filters." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {['Driver', 'Category', 'Visa #', 'Expiry', 'Monthly', 'Outstanding', 'Processing', 'Status', ''].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '9px 14px',
                        fontSize: 11,
                        color: 'var(--text3)',
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        textAlign: 'left',
                        background: 'var(--surface2)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visas.map((v) => {
                  const driver = v.driverId || {};
                  const isExpiring =
                    v.status === 'active' &&
                    v.daysUntilExpiry != null &&
                    v.daysUntilExpiry >= 0 &&
                    v.daysUntilExpiry <= 30;
                  return (
                    <tr
                      key={v._id}
                      onClick={() => setSelectedVisaId(v._id)}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isExpiring ? 'rgba(245,158,11,0.04)' : undefined,
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{driver.fullName || '—'}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                          {driver.employeeCode || ''}
                          {v.visaLabel && <span style={{ marginLeft: 6 }}>· {v.visaLabel}</span>}
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>
                        {v.visaCategory === 'twp' ? 'TWP' : 'Company'}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, fontFamily: 'var(--mono)' }}>
                        {v.visaNumber || '—'}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 11 }}>
                        <div style={{ color: 'var(--text2)' }}>{formatDate(v.expiryDate)}</div>
                        <div style={{ marginTop: 3 }}>{expiryBadge(v.daysUntilExpiry, v.expiryDate)}</div>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, fontFamily: 'var(--mono)' }}>
                        {v.monthlyDeduction > 0 ? `${n(fmt2(v.monthlyDeduction))}` : <span style={{ color: 'var(--text3)' }}>none</span>}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600 }}>
                        {n(fmt2(v.outstandingAmount))}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        {processingBadge(v)}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <Badge variant={statusVariant[v.status] || 'default'}>{v.status}</Badge>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <Btn
                          small
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVisaId(v._id);
                          }}
                        >
                          Statement
                        </Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={pagination?.pages || 1}
          total={pagination?.total ?? visas.length}
          pageSize={pagination?.limit || 20}
          onPageChange={setPage}
        />
      </div>

      {selectedVisaId && (
        <DriverVisaStatement visaId={selectedVisaId} onClose={() => setSelectedVisaId(null)} />
      )}

      {showCreate && (
        <CreateDriverVisaModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => setShowCreate(false)}
        />
      )}
    </div>
  );
};

export default DriverVisas;
