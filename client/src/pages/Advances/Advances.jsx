import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import { useAuth } from '../../context/AuthContext';
import { getAdvances } from '../../api/advancesApi';
import { getDrivers } from '../../api/driversApi';
import { formatDate } from '../../utils/formatters';
import AdvanceReviewModal from './AdvanceReviewModal';
import RequestAdvanceModal from './RequestAdvanceModal';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useFormatters } from '../../hooks/useFormatters';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'recovered', label: 'Recovered' },
];

const statusVariant = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  recovered: 'info',
  partially_recovered: 'info',
};

const Advances = () => {
  const { isMobile, isTablet } = useBreakpoint();
  const { n } = useFormatters();
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState('pending');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [reviewModal, setReviewModal] = useState(null);
  const [showDriverSearch, setShowDriverSearch] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [selectedDriver, setSelectedDriver] = useState(null);

  const { data: driverResults } = useQuery({
    queryKey: ['drivers-search', driverSearch],
    queryFn: () => getDrivers({ search: driverSearch, limit: 10 }),
    enabled: showDriverSearch && driverSearch.length >= 2,
    keepPreviousData: true,
  });
  const searchedDrivers = driverResults?.data || [];

  const { data, isLoading } = useQuery({
    queryKey: ['advances', { status: tab === 'pending' ? 'pending' : (statusFilter !== 'all' ? statusFilter : undefined), page }],
    queryFn: () => getAdvances({
      status: tab === 'pending' ? 'pending' : (statusFilter !== 'all' ? statusFilter : undefined),
      page,
      limit: 20,
    }),
    retry: 1,
  });

  const advances = data?.data || [];
  const pagination = data?.pagination;

  const kpis = useMemo(() => {
    const stats = data?.stats || {};
    return {
      pending: stats.pending ?? advances.filter(a => a.status === 'pending').length,
      approved: stats.approved ?? advances.filter(a => a.status === 'approved').length,
      totalOutstanding: stats.totalOutstanding ?? 0,
      recovered: stats.recovered ?? advances.filter(a => a.status === 'recovered').length,
    };
  }, [data, advances]);

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Pending" value={kpis.pending} color="#fbbf24" />
        <KpiCard label="Approved" value={kpis.approved} color="#4ade80" />
        <KpiCard label="Total outstanding (AED)" value={Number(kpis.totalOutstanding).toLocaleString()} color="#3b82f6" />
        <KpiCard label="Fully recovered" value={kpis.recovered} color="#a855f7" />
      </div>

      {hasPermission('advances.request') && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Btn variant="primary" onClick={() => setShowDriverSearch(true)}>
            + Request advance
          </Btn>
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderBottom: '1px solid var(--border)' }}>
          {[
            { key: 'pending', label: 'Pending review' },
            { key: 'all', label: 'All advances' },
          ].map(t => (
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
                transition: 'all .15s',
              }}
            >
              {t.label}
            </button>
          ))}
          {tab === 'all' && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, padding: '0 14px' }}>
              {STATUS_FILTERS.map(f => (
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
        ) : advances.length === 0 ? (
          <EmptyState
            title={tab === 'pending' ? 'No pending advances' : 'No advances found'}
            message={tab === 'pending' ? 'All advance requests have been reviewed.' : 'No advance requests match your filters.'}
          />
        ) : tab === 'pending' ? (
          /* Pending review — card layout */
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            {advances.map(adv => (
              <div key={adv._id} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '14px 18px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                      {adv.driverId?.fullName || adv.driverName || 'Unknown'}
                      <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>
                        {adv.driverId?.employeeCode || adv.driverCode || ''}
                      </span>
                      {adv.driverId?.clientUserId && (
                        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>
                          ID: {adv.driverId.clientUserId}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                      {adv.projectId?.name || adv.project || '—'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
                      {adv.reason}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                      Requested by {adv.requestedBy?.name || 'Unknown'} ({adv.requestedBy?.roleId?.displayName || adv.requestedByRole || '—'}) on {formatDate(adv.createdAt)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--mono)' }}>
                      AED {n(Number(adv.amount).toLocaleString())}
                    </div>
                    {hasPermission('advances.approve') && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
                        <Btn small variant="success" onClick={() => setReviewModal({ advance: adv, decision: 'approved' })}>
                          Approve
                        </Btn>
                        <Btn small variant="danger" onClick={() => setReviewModal({ advance: adv, decision: 'rejected' })}>
                          Reject
                        </Btn>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* All advances — table layout */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {['Driver', 'Project', 'Amount', 'Status', 'Requested by', 'Date', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: '9px 14px', fontSize: 11, color: 'var(--text3)', fontWeight: 500,
                      textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left',
                      background: 'var(--surface2)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {advances.map(adv => (
                  <tr key={adv._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{adv.driverId?.fullName || adv.driverName || '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                        {adv.driverId?.employeeCode || adv.driverCode || ''}
                        {adv.driverId?.clientUserId && <span style={{ marginLeft: 6 }}>ID: {adv.driverId.clientUserId}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12 }}>{adv.projectId?.name || adv.project || '—'}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)' }}>
                      AED {n(Number(adv.amount).toLocaleString())}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <Badge variant={statusVariant[adv.status] || 'default'}>{adv.status}</Badge>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12 }}>{adv.requestedBy?.name || '—'}</td>
                    <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--text3)' }}>{formatDate(adv.createdAt)}</td>
                    <td style={{ padding: '11px 14px' }}>
                      {adv.status === 'pending' && hasPermission('advances.approve') ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Btn small variant="success" onClick={() => setReviewModal({ advance: adv, decision: 'approved' })}>Approve</Btn>
                          <Btn small variant="danger" onClick={() => setReviewModal({ advance: adv, decision: 'rejected' })}>Reject</Btn>
                        </div>
                      ) : adv.status !== 'pending' && adv.reviewedByName ? (
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {adv.status === 'approved' ? 'Approved' : adv.status === 'rejected' ? 'Rejected' : adv.status.replace('_', ' ')} by {adv.reviewedByName}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={pagination?.pages || 1}
          total={pagination?.total ?? advances.length}
          pageSize={pagination?.limit || 20}
          onPageChange={setPage}
        />
      </div>

      {reviewModal && (
        <AdvanceReviewModal
          advance={reviewModal.advance}
          decision={reviewModal.decision}
          onClose={() => setReviewModal(null)}
          onSuccess={() => setReviewModal(null)}
        />
      )}

      {showDriverSearch && !selectedDriver && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => { setShowDriverSearch(false); setDriverSearch(''); }}>
          <div
            style={{
              background: 'var(--surface)', borderRadius: 12, padding: 20,
              width: isMobile ? '92%' : 420, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
              border: '1px solid var(--border)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Select driver</div>
            <input
              autoFocus
              type="text"
              placeholder="Search by name or employee code..."
              value={driverSearch}
              onChange={e => setDriverSearch(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8,
                border: '1px solid var(--border2)', background: 'var(--surface)',
                color: 'var(--text)', fontSize: 13, marginBottom: 8,
              }}
            />
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {driverSearch.length < 2 ? (
                <div style={{ fontSize: 12, color: 'var(--text3)', padding: '16px 0', textAlign: 'center' }}>
                  Type at least 2 characters to search
                </div>
              ) : searchedDrivers.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text3)', padding: '16px 0', textAlign: 'center' }}>
                  No drivers found
                </div>
              ) : (
                searchedDrivers.map(d => {
                  const isActive = d.status === 'active';
                  return (
                    <div
                      key={d._id}
                      onClick={() => isActive && setSelectedDriver(d)}
                      style={{
                        padding: '10px 12px', cursor: isActive ? 'pointer' : 'not-allowed', borderRadius: 8,
                        border: '1px solid var(--border)', marginBottom: 6,
                        opacity: isActive ? 1 : 0.55,
                        transition: 'background .1s',
                      }}
                      onMouseEnter={e => isActive && (e.currentTarget.style.background = 'var(--surface2)')}
                      onMouseLeave={e => isActive && (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{d.fullName || d.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {d.employeeCode || ''}
                        </span>
                        {d.clientUserId && (
                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                            ID: {d.clientUserId}
                          </span>
                        )}
                        {!isActive && (
                          <Badge variant="default" style={{ fontSize: 9, padding: '1px 6px' }}>{d.status}</Badge>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {d.projectId?.name || '—'} &middot; {d.clientId?.name || d.projectId?.clientId?.name || '—'}
                      </div>
                      {!isActive && (
                        <div style={{ fontSize: 10, color: '#f87171', marginTop: 3 }}>
                          Only active drivers can receive advances
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Btn variant="ghost" onClick={() => { setShowDriverSearch(false); setDriverSearch(''); }}>
                Cancel
              </Btn>
            </div>
          </div>
        </div>
      )}

      {selectedDriver && (
        <RequestAdvanceModal
          driver={selectedDriver}
          onClose={() => { setSelectedDriver(null); setShowDriverSearch(false); setDriverSearch(''); }}
          onSuccess={() => { setSelectedDriver(null); setShowDriverSearch(false); setDriverSearch(''); }}
        />
      )}
    </div>
  );
};

export default Advances;
