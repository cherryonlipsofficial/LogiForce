import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { getGuaranteePassports } from '../api/guaranteePassportApi';
import { useNavigate } from 'react-router-dom';

const STATUS_VARIANTS = {
  active: 'success',
  extended: 'info',
  expired: 'danger',
  returned: 'warning',
  replaced: 'default',
};

const formatDate = (d) => {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'extended', label: 'Extended' },
  { value: 'expired', label: 'Expired' },
  { value: 'returned', label: 'Returned' },
];

const GuaranteePassports = () => {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['guarantee-passports-all'],
    queryFn: () => getGuaranteePassports(),
    retry: 1,
    onError: () => toast.error('Failed to load guarantee passports'),
  });

  const records = data?.data || [];

  const filtered = records.filter((g) => {
    if (statusFilter !== 'all' && g.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const driverName = (g.driverId?.fullName || '').toLowerCase();
      const empCode = (g.driverId?.employeeCode || '').toLowerCase();
      const guarantor = (g.guarantorName || '').toLowerCase();
      if (!driverName.includes(q) && !empCode.includes(q) && !guarantor.includes(q)) return false;
    }
    return true;
  });

  // Counts by status
  const counts = {};
  for (const g of records) {
    counts[g.status] = (counts[g.status] || 0) + 1;
  }

  const pillStyle = (active) => ({
    padding: '6px 14px',
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
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Guarantee passports</h1>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>
          All guarantee passport records across drivers
        </p>
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              style={pillStyle(statusFilter === opt.value)}
            >
              {opt.label}
              {opt.value !== 'all' && counts[opt.value] > 0 && (
                <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 600 }}>
                  ({counts[opt.value]})
                </span>
              )}
              {opt.value === 'all' && (
                <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 600 }}>
                  ({records.length})
                </span>
              )}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by driver name, code, or guarantor..."
          style={{
            padding: '7px 12px', fontSize: 12, borderRadius: 8, marginLeft: 'auto',
            border: '1px solid var(--border2)', background: 'var(--surface2)',
            color: 'var(--text)', width: 260,
          }}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 14, color: 'var(--text3)' }}>
            {search || statusFilter !== 'all' ? 'No matching guarantee passports found' : 'No guarantee passports recorded'}
          </div>
        </Card>
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Driver', 'Guarantor', 'Relation', 'Submitted', 'Expires', 'Days left', 'Status', 'Extension', 'Action'].map((h) => (
                    <th key={h} style={{
                      padding: '8px 10px', fontSize: 11, color: 'var(--text3)', fontWeight: 500,
                      textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => {
                  const driver = g.driverId || {};
                  const daysLeft = Math.ceil((new Date(g.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
                  const isExpired = daysLeft <= 0;

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
                        {g.guarantorRelation || '--'}
                      </td>
                      <td style={{ padding: '10px', fontSize: 12, color: 'var(--text3)' }}>
                        {formatDate(g.submittedDate)}
                      </td>
                      <td style={{ padding: '10px', fontSize: 12, color: 'var(--text2)' }}>
                        {formatDate(g.expiryDate)}
                      </td>
                      <td style={{ padding: '10px' }}>
                        {isExpired ? (
                          <Badge variant="danger">Expired</Badge>
                        ) : (
                          <Badge variant={daysLeft <= 6 ? 'danger' : daysLeft <= 14 ? 'warning' : 'success'}>
                            {daysLeft}d
                          </Badge>
                        )}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <Badge variant={STATUS_VARIANTS[g.status] || 'default'}>
                          {g.status}
                        </Badge>
                      </td>
                      <td style={{ padding: '10px', fontSize: 11, color: 'var(--text3)' }}>
                        {g.extensionRequest?.status === 'pending' ? (
                          <Badge variant="warning">Pending</Badge>
                        ) : g.extensionCount > 0 ? (
                          <span>{g.extensionCount}x extended</span>
                        ) : (
                          <span>--</span>
                        )}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <button
                          onClick={() => navigate(`/drivers?search=${encodeURIComponent(driver.employeeCode || driver.fullName || '')}`)}
                          style={{
                            padding: '4px 10px', borderRadius: 6, fontSize: 11,
                            border: '1px solid var(--border2)', background: 'transparent',
                            color: 'var(--accent)', cursor: 'pointer',
                          }}
                        >
                          View driver →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px', fontSize: 12, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
            Showing {filtered.length} of {records.length} guarantee passport{records.length !== 1 ? 's' : ''}
          </div>
        </Card>
      )}
    </div>
  );
};

export default GuaranteePassports;
