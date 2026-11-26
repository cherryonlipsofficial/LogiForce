import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAuditActions, listAuditLogs } from '../api/platformApi';
import { platformErrorMessage } from '../api/platformAxios';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Btn from '../../components/ui/Btn';
import Pagination from '../../components/ui/Pagination';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import { inputStyle, labelStyle, tableStyle, thStyle, tdStyle, errorBox, formatDateTime } from '../components/styles';

const PAGE_SIZE = 25;
const EMPTY_FILTERS = { action: '', targetType: '', targetKey: '', actor: '', from: '', to: '' };

const Json = ({ label, value }) => (
  <div style={{ flex: 1, minWidth: 240 }}>
    <div style={{ ...labelStyle, marginBottom: 4 }}>{label}</div>
    <pre style={{
      margin: 0, padding: 10, borderRadius: 8, background: 'var(--surface2)', fontSize: 11,
      fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto',
    }}>
      {value === undefined || value === null ? '—' : JSON.stringify(value, null, 2)}
    </pre>
  </div>
);

export default function AuditLog() {
  const [filters, setFilters] = useState(EMPTY_FILTERS); // what the form shows
  const [applied, setApplied] = useState(EMPTY_FILTERS); // what the list uses
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);

  const params = Object.fromEntries(Object.entries({ ...applied, page, limit: PAGE_SIZE }).filter(([, v]) => v !== ''));
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['platform', 'audit', params],
    queryFn: () => listAuditLogs(params),
    placeholderData: (prev) => prev,
  });
  const { data: options } = useQuery({ queryKey: ['platform', 'audit', 'actions'], queryFn: listAuditActions });

  const entries = data?.entries || [];
  const pagination = data?.pagination;
  const set = (field) => (e) => setFilters((f) => ({ ...f, [field]: e.target.value }));
  const apply = (next) => { setApplied(next); setPage(1); setOpen(null); };

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every change made on the platform, newest first" />

      <Card style={{ marginBottom: 14 }}>
        <form
          onSubmit={(e) => { e.preventDefault(); apply(filters); }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}
        >
          <div>
            <label style={labelStyle} htmlFor="al-action">Action</label>
            <select id="al-action" value={filters.action} onChange={set('action')} style={inputStyle}>
              <option value="">Any</option>
              {(options?.actions || []).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="al-type">Target type</label>
            <select id="al-type" value={filters.targetType} onChange={set('targetType')} style={inputStyle}>
              <option value="">Any</option>
              {(options?.targetTypes || []).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="al-target">Target</label>
            <input id="al-target" placeholder="company, role or email" value={filters.targetKey} onChange={set('targetKey')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="al-actor">Done by</label>
            <input id="al-actor" placeholder="email" value={filters.actor} onChange={set('actor')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="al-from">From</label>
            <input id="al-from" type="date" value={filters.from} onChange={set('from')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="al-to">To</label>
            <input id="al-to" type="date" value={filters.to} onChange={set('to')} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn type="submit" variant="primary">Filter</Btn>
            <Btn onClick={() => { setFilters(EMPTY_FILTERS); apply(EMPTY_FILTERS); }}>Clear</Btn>
          </div>
        </form>
      </Card>

      {error && <div style={{ ...errorBox, marginBottom: 14 }}>{platformErrorMessage(error, 'Could not load the audit log')}</div>}

      <Card style={{ padding: 0, overflowX: 'auto', opacity: isFetching && !isLoading ? 0.7 : 1 }}>
        {isLoading ? <LoadingSpinner /> : entries.length === 0 ? (
          <EmptyState icon="" title="No entries" message="Nothing matches these filters." />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>Done by</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Target</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <Fragment key={e._id}>
                  <tr>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--text2)' }}>{formatDateTime(e.createdAt)}</td>
                    <td style={tdStyle}>{e.actor?.email}</td>
                    <td style={{ ...tdStyle, fontFamily: 'var(--mono)', fontSize: 12 }}>{e.action}</td>
                    <td style={tdStyle}>
                      <span style={{ color: 'var(--text3)', fontSize: 11 }}>{e.targetType}</span>{' '}
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{e.targetKey || String(e.targetId)}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <Btn small onClick={() => setOpen(open === e._id ? null : e._id)}>{open === e._id ? 'Hide' : 'Details'}</Btn>
                    </td>
                  </tr>
                  {open === e._id && (
                    <tr>
                      <td colSpan={5} style={{ ...tdStyle, background: 'var(--bg)' }}>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <Json label="Before" value={e.before} />
                          <Json label="After" value={e.after} />
                        </div>
                        {(e.ip || e.userAgent) && (
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
                            {e.ip && <>IP {e.ip}</>}{e.ip && e.userAgent && ' · '}{e.userAgent}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {pagination && (
        <div style={{ marginTop: 12 }}>
          <Pagination
            page={pagination.page}
            totalPages={pagination.pages}
            total={pagination.total}
            pageSize={pagination.limit}
            onPageChange={(p) => { setPage(p); setOpen(null); }}
          />
        </div>
      )}
    </div>
  );
}
