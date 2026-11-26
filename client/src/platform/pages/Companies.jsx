import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listTenants } from '../api/platformApi';
import { platformErrorMessage } from '../api/platformAxios';
import { usePlatformAuth } from '../auth/platformAuthContext';
import PageHeader from '../../components/ui/PageHeader';
import Btn from '../../components/ui/Btn';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import TenantStatusBadge from '../components/TenantStatusBadge';
import NewCompanyModal from './NewCompanyModal';
import { inputStyle, tableStyle, thStyle, tdStyle, errorBox, formatDate } from '../components/styles';

const STATUSES = ['', 'active', 'suspended', 'provisioning', 'failed'];

export default function Companies() {
  const { isOwner } = usePlatformAuth();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['platform', 'tenants', { status, search }],
    queryFn: () => listTenants({ status: status || undefined, search: search.trim() || undefined }),
    placeholderData: (prev) => prev,
  });
  const tenants = data?.tenants || [];

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle="Every company on LogiForce"
        action={isOwner && <Btn variant="primary" onClick={() => setCreating(true)}>New company</Btn>}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          placeholder="Search key or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, maxWidth: 280 }}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inputStyle, width: 170 }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? s[0].toUpperCase() + s.slice(1) : 'All statuses'}</option>)}
        </select>
      </div>

      {error && <div style={{ ...errorBox, marginBottom: 14 }}>{platformErrorMessage(error, 'Could not load companies')}</div>}

      <Card style={{ padding: 0, overflowX: 'auto' }}>
        {isLoading ? <LoadingSpinner /> : tenants.length === 0 ? (
          <EmptyState icon="" title="No companies" message={search || status ? 'Nothing matches these filters.' : 'Create the first one with "New company".'} />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Key</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.key}>
                  <td style={tdStyle}>
                    <Link to={`/platform/companies/${t.key}`} style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                      {t.key}
                    </Link>
                  </td>
                  <td style={tdStyle}>{t.name}</td>
                  <td style={tdStyle}><TenantStatusBadge status={t.status} /></td>
                  <td style={{ ...tdStyle, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{formatDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {creating && <NewCompanyModal onClose={() => setCreating(false)} />}
    </div>
  );
}
