import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { getExpiredDocuments } from '../api/driversApi';
import { useNavigate } from 'react-router-dom';

const DOC_TYPE_OPTIONS = [
  { value: 'all', label: 'All documents' },
  { value: 'emirates_id', label: 'Emirates ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'visa', label: 'Residency Visa' },
  { value: 'labour_card', label: 'Labour Card' },
  { value: 'driving_licence', label: 'Driving Licence' },
  { value: 'mulkiya', label: 'Mulkiya' },
  { value: 'guarantee_passport', label: 'Guarantee Passport' },
];

const DOC_TYPE_LABELS = {
  emirates_id: 'Emirates ID',
  passport: 'Passport',
  visa: 'Residency Visa',
  labour_card: 'Labour Card',
  driving_licence: 'Driving Licence',
  mulkiya: 'Mulkiya',
  guarantee_passport: 'Guarantee Passport',
};

const formatDate = (d) => {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const ExpiredDocuments = () => {
  const [docType, setDocType] = useState('all');
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['expired-documents', docType],
    queryFn: () => getExpiredDocuments(docType),
    retry: 1,
    onError: () => toast.error('Failed to load expired documents'),
  });

  const records = data?.data || [];

  // Group counts by doc type for summary
  const typeCounts = {};
  for (const r of records) {
    typeCounts[r.docType] = (typeCounts[r.docType] || 0) + 1;
  }

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Expired documents</h1>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>
          Drivers with expired documents that need immediate attention
        </p>
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>Filter by document:</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DOC_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDocType(opt.value)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: '1px solid ' + (docType === opt.value ? 'var(--accent)' : 'var(--border2)'),
                background: docType === opt.value ? 'rgba(79,142,247,0.12)' : 'transparent',
                color: docType === opt.value ? 'var(--accent)' : 'var(--text3)',
                fontSize: 12,
                fontWeight: docType === opt.value ? 500 : 400,
                cursor: 'pointer',
              }}
            >
              {opt.label}
              {docType === 'all' && typeCounts[opt.value] > 0 && opt.value !== 'all' && (
                <span style={{
                  marginLeft: 4, background: '#ef4444', color: '#fff', borderRadius: 8,
                  fontSize: 10, padding: '0 5px', fontWeight: 600,
                }}>
                  {typeCounts[opt.value]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Summary badges */}
      {docType === 'all' && records.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(typeCounts).map(([type, count]) => (
            <div
              key={type}
              onClick={() => setDocType(type)}
              style={{
                padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                fontSize: 12, color: '#f87171', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <strong>{count}</strong> {DOC_TYPE_LABELS[type] || type}
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <LoadingSpinner />
      ) : records.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8, color: '#22c55e' }}>&#10003;</div>
            <div style={{ fontSize: 14, color: 'var(--text3)' }}>
              No expired {docType !== 'all' ? DOC_TYPE_LABELS[docType]?.toLowerCase() + ' ' : ''}documents found
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Driver', 'Employee Code', 'Document type', 'Expired on', 'Days overdue', 'Status', 'Action'].map((h) => (
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
                {records.map((r, i) => (
                  <tr key={`${r.driverId}-${r.docType}-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px', fontSize: 12 }}>
                      <div style={{ fontWeight: 500 }}>{r.driverName || '--'}</div>
                      {r.clientName && (
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>{r.clientName}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px', fontFamily: '"DM Mono", var(--mono)', fontSize: 12, color: 'var(--text2)' }}>
                      {r.employeeCode || '--'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <Badge variant={r.docType === 'guarantee_passport' ? 'warning' : 'info'}>
                        {DOC_TYPE_LABELS[r.docType] || r.docType}
                      </Badge>
                      {r.guarantorName && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                          Guarantor: {r.guarantorName}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px', fontSize: 12, color: 'var(--text2)' }}>
                      {formatDate(r.expiryDate)}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <Badge variant={r.daysOverdue > 30 ? 'danger' : r.daysOverdue > 7 ? 'warning' : 'danger'}>
                        {r.daysOverdue}d overdue
                      </Badge>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <Badge variant={r.driverStatus === 'active' ? 'success' : r.driverStatus === 'suspended' ? 'danger' : 'info'}>
                        {r.driverStatus || '--'}
                      </Badge>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <button
                        onClick={() => navigate('/drivers')}
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
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px', fontSize: 12, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
            Showing {records.length} expired document{records.length !== 1 ? 's' : ''}
          </div>
        </Card>
      )}
    </div>
  );
};

export default ExpiredDocuments;
