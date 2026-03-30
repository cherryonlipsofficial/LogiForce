import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ProjectSelect from '../../components/ui/ProjectSelect';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { formatCurrencyFull } from '../../utils/formatters';
import { getStatementOfAccounts } from '../../api/creditNotesApi';

const StatementOfAccounts = () => {
  const { isMobile } = useBreakpoint();
  const now = new Date();
  const [projectId, setProjectId] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [expandedMonth, setExpandedMonth] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['statement-of-accounts', projectId, year],
    queryFn: () => getStatementOfAccounts({ projectId, year }),
    enabled: !!projectId,
    retry: 1,
  });

  const result = data?.data;
  const months = result?.months || [];
  const yearlyTotals = result?.yearlyTotals || {};

  // Filter months that have data
  const activeMonths = months.filter(
    (m) => m.invoices.length > 0 || m.creditNotes.length > 0
  );

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexDirection: isMobile ? 'column' : 'row' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Project</label>
          <ProjectSelect value={projectId} onChange={setProjectId} />
        </div>
        <div style={{ width: 120 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Year</label>
          <input type="number" value={year} onChange={(e) => setYear(e.target.value)} style={{ width: '100%' }} />
        </div>
      </div>

      {!projectId ? (
        <EmptyState title="Select a project" message="Choose a project to view the statement of accounts." />
      ) : isLoading ? (
        <LoadingSpinner />
      ) : activeMonths.length === 0 ? (
        <EmptyState title="No data" message="No invoices or credit notes found for this project and year." />
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {['Month', 'Invoiced', 'Credit Notes', 'Net Receivable', 'Received', 'Outstanding'].map((h) => (
                    <th key={h} style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: h === 'Month' ? 'left' : 'right', background: 'var(--surface2)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const hasData = m.invoices.length > 0 || m.creditNotes.length > 0;
                  if (!hasData) return null;
                  const isExpanded = expandedMonth === m.month;
                  const outstanding = m.outstandingBalance;

                  return (
                    <MonthRow
                      key={m.month}
                      month={m}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedMonth(isExpanded ? null : m.month)}
                    />
                  );
                })}
                {/* Yearly totals row */}
                <tr style={{ background: 'var(--surface2)', fontWeight: 600 }}>
                  <td style={{ padding: '11px 14px', fontSize: 13 }}>Yearly Total</td>
                  <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }}>
                    {formatCurrencyFull(yearlyTotals.totalInvoiced || 0)}
                  </td>
                  <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right', color: '#f87171' }}>
                    -{formatCurrencyFull(yearlyTotals.totalCreditNotes || 0)}
                  </td>
                  <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }}>
                    {formatCurrencyFull(yearlyTotals.netReceivable || 0)}
                  </td>
                  <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }}>
                    {formatCurrencyFull(yearlyTotals.totalReceived || 0)}
                  </td>
                  <td style={{
                    padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right',
                    color: (yearlyTotals.outstandingBalance || 0) > 0 ? '#f87171' : '#4ade80',
                  }}>
                    {formatCurrencyFull(yearlyTotals.outstandingBalance || 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const MonthRow = ({ month: m, isExpanded, onToggle }) => {
  const outstanding = m.outstandingBalance;

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <td style={{ padding: '11px 14px', fontSize: 13 }}>
          <span style={{ marginRight: 6, fontSize: 10, color: 'var(--text3)' }}>{isExpanded ? '▼' : '▶'}</span>
          {m.monthName} {m.year}
        </td>
        <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }}>
          {formatCurrencyFull(m.totalInvoiced)}
        </td>
        <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right', color: m.totalCreditNotes > 0 ? '#f87171' : 'var(--text3)' }}>
          {m.totalCreditNotes > 0 ? `-${formatCurrencyFull(m.totalCreditNotes)}` : '—'}
        </td>
        <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }}>
          {formatCurrencyFull(m.netReceivable)}
        </td>
        <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }}>
          {formatCurrencyFull(m.totalReceived)}
        </td>
        <td style={{
          padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right', fontWeight: 600,
          color: outstanding > 0 ? '#f87171' : '#4ade80',
        }}>
          {formatCurrencyFull(outstanding)}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={6} style={{ padding: 0 }}>
            <div style={{ background: 'var(--surface2)', padding: '10px 24px 14px' }}>
              {m.invoices.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invoices</div>
                  {m.invoices.map((inv, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>{inv.invoiceNo}</span>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--mono)' }}>{formatCurrencyFull(inv.total)}</span>
                        {inv.adjustedTotal != null && inv.adjustedTotal !== inv.total && (
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 11 }}>adj: {formatCurrencyFull(inv.adjustedTotal)}</span>
                        )}
                        <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'sent' ? 'info' : 'default'}>{inv.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {m.creditNotes.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Credit Notes</div>
                  {m.creditNotes.map((cn, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#a78bfa' }}>{cn.creditNoteNo}</span>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--mono)', color: '#f87171' }}>-{formatCurrencyFull(cn.totalAmount)}</span>
                        {cn.linkedInvoiceNo && (
                          <span style={{ fontSize: 10, color: 'var(--text3)' }}>→ {cn.linkedInvoiceNo}</span>
                        )}
                        <Badge variant={cn.status === 'settled' ? 'success' : cn.status === 'adjusted' ? 'purple' : 'warning'}>{cn.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export default StatementOfAccounts;
