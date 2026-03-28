import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Btn from '../components/ui/Btn';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { getPendingExtensions, reviewExtension, getExpiringGuarantees } from '../api/guaranteeApi';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../hooks/useBreakpoint';

const formatDate = (d) => {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const relativeTime = (d) => {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const daysColor = (d) => {
  if (d <= 0) return '#ef4444';
  if (d <= 6) return '#ef4444';
  if (d <= 14) return '#f59e0b';
  return '#22c55e';
};

const PendingCard = ({ g, onDone }) => {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState(false);

  const mutation = useMutation({
    mutationFn: ({ decision, reviewNotes }) => reviewExtension(g._id, { decision, reviewNotes }),
    onSuccess: (_, { decision }) => {
      if (decision === 'approved') {
        const newExpiry = g.extensionRequest?.newExpiryDate;
        toast.success(`Extension approved${newExpiry ? ` — new expiry: ${formatDate(newExpiry)}` : ''}`);
      } else {
        toast.success('Extension rejected');
      }
      setRemoving(true);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['pending-extensions'] });
      }, 300);
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Action failed'),
  });

  const handleApprove = () => {
    setError('');
    mutation.mutate({ decision: 'approved', reviewNotes: notes });
  };

  const handleReject = () => {
    if (!notes.trim()) {
      setError('Review notes required when rejecting');
      return;
    }
    setError('');
    mutation.mutate({ decision: 'rejected', reviewNotes: notes });
  };

  const driver = g.driverId || {};
  const ext = g.extensionRequest || {};
  const daysLeft = g.daysRemaining ?? Math.ceil((new Date(g.expiryDate) - new Date()) / 86400000);

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        transition: 'opacity .3s, transform .3s',
        opacity: removing ? 0 : 1,
        transform: removing ? 'translateX(20px)' : 'none',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--surface3)', border: '1px solid var(--border2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 500, color: 'var(--accent)',
            }}
          >
            {(driver.fullName || 'U').split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <span style={{ fontWeight: 500, fontSize: 13 }}>{driver.fullName || 'Unknown'}</span>
            {driver.employeeCode && (
              <span style={{ fontFamily: '"DM Mono", var(--mono)', fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>
                {driver.employeeCode}
              </span>
            )}
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Requested {relativeTime(ext.requestedAt)}</span>
      </div>

      {/* Guarantee info */}
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, display: 'flex', gap: 24 }}>
        <span>Guarantor: <strong>{g.guarantorName}</strong> ({g.guarantorRelation})</span>
        <span>
          Current expiry: <strong>{formatDate(g.expiryDate)}</strong>
          {' '}<Badge variant={daysLeft <= 7 ? 'danger' : daysLeft <= 14 ? 'warning' : 'success'}>{daysLeft}d left</Badge>
        </span>
      </div>

      {/* Request details */}
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
        <div style={{ marginBottom: 4 }}>
          Requesting: <strong>{ext.requestedDays} extra days</strong>
          {ext.newExpiryDate && <> — Proposed new expiry: <strong>{formatDate(ext.newExpiryDate)}</strong></>}
        </div>
        {ext.reason && (
          <div style={{
            borderLeft: '3px solid var(--border2)', paddingLeft: 10,
            fontStyle: 'italic', color: 'var(--text3)', margin: '6px 0',
          }}>
            "{ext.reason}"
          </div>
        )}
        {ext.requestedBy && (
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            Requested by: {ext.requestedBy.name} on {formatDate(ext.requestedAt)}
          </div>
        )}
      </div>

      {/* Extension history */}
      {g.extensionCount > 0 && (
        <div style={{
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#f59e0b', marginBottom: 10,
        }}>
          This guarantee has been extended {g.extensionCount} time(s) before
        </div>
      )}

      {/* Action row */}
      <div>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); if (error) setError(''); }}
          placeholder="Add notes (required when rejecting)..."
          style={{
            width: '100%', minHeight: 60, padding: '8px 10px', fontSize: 12,
            background: 'var(--surface2)', border: '1px solid var(--border2)',
            borderRadius: 8, color: 'var(--text)', resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        {error && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Btn
            small
            variant="success"
            onClick={handleApprove}
            disabled={mutation.isPending}
            style={{ background: '#22c55e', borderColor: '#22c55e', color: '#fff' }}
          >
            {mutation.isPending ? '...' : 'Approve extension'}
          </Btn>
          <Btn
            small
            variant="danger"
            onClick={handleReject}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? '...' : 'Reject'}
          </Btn>
        </div>
      </div>
    </div>
  );
};

const GuaranteeExtensions = () => {
  const { isMobile } = useBreakpoint();
  const [tab, setTab] = useState('pending');
  const navigate = useNavigate();

  const { data: pending, isLoading: pendingLoading } = useQuery({
    queryKey: ['pending-extensions'],
    queryFn: () => getPendingExtensions().then(r => r.data?.data || r.data || []),
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: expiring, isLoading: expiringLoading } = useQuery({
    queryKey: ['expiring-guarantees-30'],
    queryFn: () => getExpiringGuarantees(30, true).then(r => r.data?.data || r.data || []),
    refetchInterval: 5 * 60 * 1000,
  });

  const pendingList = Array.isArray(pending) ? pending : [];
  const expiringList = Array.isArray(expiring) ? expiring : [];

  const pillStyle = (active) => ({
    padding: '7px 16px',
    borderRadius: 20,
    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border2)'),
    background: active ? 'rgba(79,142,247,0.12)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text3)',
    fontSize: 12,
    fontWeight: active ? 500 : 400,
    cursor: 'pointer',
  });

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Guarantee passport approvals</h1>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>
          Review and action extension requests from the compliance team
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
        <button style={pillStyle(tab === 'pending')} onClick={() => setTab('pending')}>
          Pending approval ({pendingList.length})
        </button>
        <button style={pillStyle(tab === 'expiring')} onClick={() => setTab('expiring')}>
          Expiring soon
        </button>
      </div>

      {/* Tab content */}
      {tab === 'pending' && (
        <div>
          {pendingLoading ? (
            <LoadingSpinner />
          ) : pendingList.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8, color: '#22c55e' }}>&#10003;</div>
                <div style={{ fontSize: 14, color: 'var(--text3)' }}>No pending extension requests</div>
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingList.map((g) => (
                <PendingCard key={g._id} g={g} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'expiring' && (
        <div>
          {expiringLoading ? (
            <LoadingSpinner />
          ) : expiringList.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 14, color: 'var(--text3)' }}>
                No guarantees expiring within 30 days
              </div>
            </Card>
          ) : (
            <Card>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Driver', 'Guarantor', 'Submitted', 'Expires', 'Days left', 'Status', 'Action'].map((h) => (
                        <th key={h} style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text3)', fontWeight: 500, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {expiringList.map((g) => {
                      const driver = g.driverId || {};
                      const daysLeft = g.daysRemaining ?? Math.ceil((new Date(g.expiryDate) - new Date()) / 86400000);
                      const isExpired = daysLeft <= 0;
                      const hasPending = g.extensionRequest?.status === 'pending';

                      return (
                        <tr key={g._id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px', fontSize: 12 }}>
                            <div style={{ fontWeight: 500 }}>{driver.fullName || '--'}</div>
                            {driver.employeeCode && (
                              <div style={{ fontFamily: '"DM Mono", var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                                {driver.employeeCode}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px', fontSize: 12, color: 'var(--text2)' }}>
                            {g.guarantorName || '--'}
                          </td>
                          <td style={{ padding: '10px', fontSize: 12, color: 'var(--text3)' }}>
                            {formatDate(g.submittedDate)}
                          </td>
                          <td style={{ padding: '10px', fontSize: 12, color: 'var(--text2)' }}>
                            {formatDate(g.expiryDate)}
                          </td>
                          <td style={{ padding: '10px' }}>
                            <Badge
                              variant={isExpired ? 'danger' : daysLeft <= 6 ? 'danger' : daysLeft <= 14 ? 'warning' : 'success'}
                            >
                              {isExpired ? 'Expired' : `${daysLeft}d`}
                            </Badge>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <Badge variant={g.status === 'extended' ? 'info' : g.status === 'active' ? 'success' : 'danger'}>
                              {g.status}
                            </Badge>
                          </td>
                          <td style={{ padding: '10px' }}>
                            {isExpired ? (
                              <Btn small variant="ghost" onClick={() => toast('Driver notification sent')}>
                                Notify driver
                              </Btn>
                            ) : !hasPending ? (
                              <Btn small variant="ghost" onClick={() => navigate('/drivers')}>
                                View driver →
                              </Btn>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Pending review</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default GuaranteeExtensions;
