import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import PermissionGate from '../../components/ui/PermissionGate';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import SidePanel from '../../components/ui/SidePanel';
import ClientSelect from '../../components/ui/ClientSelect';
import ProjectSelect from '../../components/ui/ProjectSelect';
import { getInvoices, getInvoice, generateInvoice, updateStatus, downloadPdf, deleteInvoice, getApprovedBatches } from '../../api/invoicesApi';
import { recordInvoicePayment } from '../../api/creditNotesApi';
import { formatDate } from '../../utils/formatters';
import { useFormatters } from '../../hooks/useFormatters';
import Pagination from '../../components/ui/Pagination';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { downloadBlob } from '../../utils/downloadBlob';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const normalizeInvoice = (inv) => {
  if (inv.client && typeof inv.period === 'string') return inv;
  return {
    ...inv,
    invoiceNo: inv.invoiceNo || inv._id,
    client: inv.clientId?.name || inv.client || 'Unknown',
    projectName: inv.projectId?.name || inv.projectName || null,
    period: inv.period?.year ? `${MONTHS[(inv.period.month || 1) - 1]} ${inv.period.year}` : inv.period,
    amount: inv.total ?? inv.amount,
    issueDate: inv.issuedDate || inv.issueDate,
  };
};

const statusMap = {
  draft: { label: 'Draft', variant: 'default' },
  sent: { label: 'Sent', variant: 'info' },
  paid: { label: 'Paid', variant: 'success' },
  overdue: { label: 'Overdue', variant: 'danger' },
  cancelled: { label: 'Cancelled', variant: 'default' },
};

const Invoices = () => {
  const { isMobile, isTablet } = useBreakpoint();
  const { formatCurrencyFull } = useFormatters();
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkInvoiceId = searchParams.get('invoiceId');

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', { status: statusFilter, page }],
    queryFn: () => getInvoices({ status: statusFilter !== 'all' ? statusFilter : undefined, page, limit: 20 }),
    retry: 1,
  });

  const { data: deepLinkData } = useQuery({
    queryKey: ['invoice-deeplink', deepLinkInvoiceId],
    queryFn: () => getInvoice(deepLinkInvoiceId),
    enabled: !!deepLinkInvoiceId && !selectedInvoice,
    retry: 1,
  });

  useEffect(() => {
    if (deepLinkData?.data && !selectedInvoice) {
      setSelectedInvoice(normalizeInvoice(deepLinkData.data));
    }
  }, [deepLinkData, selectedInvoice]);

  const closeInvoiceDetail = () => {
    setSelectedInvoice(null);
    if (deepLinkInvoiceId) {
      const next = new URLSearchParams(searchParams);
      next.delete('invoiceId');
      setSearchParams(next, { replace: true });
    }
  };

  const invoices = (data?.data || []).map(normalizeInvoice);
  const pagination = data?.pagination;
  const filtered = invoices;

  const totalInvoicedAmount = invoices.reduce((s, i) => s + i.amount, 0);
  const totalOutstanding = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.amount, 0);
  const totalCollected = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + (i.amountReceived || (i.adjustedTotal != null ? i.adjustedTotal : i.amount)), 0);
  const overdueCount = invoices.filter((i) => i.status === 'overdue').length;

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(3,1fr)' : 'repeat(5,1fr)', gap: 12 }}>
        <KpiCard label="Total invoices" value={invoices.length} />
        <KpiCard label="Invoiced amount" value={formatCurrencyFull(totalInvoicedAmount)} color="#818cf8" />
        <KpiCard label="Outstanding" value={formatCurrencyFull(totalOutstanding)} color="#fbbf24" />
        <KpiCard label="Collected" value={formatCurrencyFull(totalCollected)} color="#4ade80" />
        <KpiCard label="Overdue" value={overdueCount} color={overdueCount > 0 ? '#f87171' : '#4ade80'} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)', flexDirection: isMobile ? 'column' : 'row' }}>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ width: 180, height: 34 }}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <PermissionGate permission="invoices.generate">
              <Btn small variant="primary" onClick={() => setShowGenerate(true)}>Generate invoice</Btn>
            </PermissionGate>
          </div>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No invoices" message="Generate an invoice to get started." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {['Invoice', 'Client', 'Project', 'Period', 'Amount', 'Status', 'Issue date', 'Due date', 'Credit notes'].map((h) => (
                    <th key={h} style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', background: 'var(--surface2)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const st = statusMap[inv.status] || statusMap.draft;
                  return (
                    <tr
                      key={inv._id}
                      onClick={() => setSelectedInvoice(inv)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{inv.invoiceNo || inv._id}</span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{inv.client}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{inv.projectName || '—'}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{inv.period}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{inv.status === 'paid' ? formatCurrencyFull(inv.amountReceived != null ? inv.amountReceived : (inv.adjustedTotal != null ? inv.adjustedTotal : inv.amount)) : formatCurrencyFull(inv.amount)}</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}><Badge variant={st.variant}>{st.label}</Badge></td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--text3)' }}>{formatDate(inv.issueDate)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: inv.status === 'overdue' ? '#f87171' : 'var(--text3)' }}>{formatDate(inv.dueDate)}</td>
                      <td style={{ padding: '11px 14px' }}>
                        {inv.linkedCreditNotes?.length > 0 ? (
                          <Badge variant="purple">{inv.linkedCreditNotes.length}</Badge>
                        ) : (
                          <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
                        )}
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
          total={pagination?.total ?? invoices.length}
          pageSize={pagination?.limit || 20}
          onPageChange={setPage}
        />
      </div>

      {selectedInvoice && <InvoiceDetail invoice={selectedInvoice} onClose={closeInvoiceDetail} />}
      {showGenerate && <GenerateInvoiceModal onClose={() => setShowGenerate(false)} />}
    </div>
  );
};

const InvoiceDetail = ({ invoice, onClose }) => {
  const { isMobile } = useBreakpoint();
  const { formatCurrencyFull } = useFormatters();
  const qc = useQueryClient();
  const [showPayment, setShowPayment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteRemark, setDeleteRemark] = useState('');
  const [viewingPdf, setViewingPdf] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const st = statusMap[invoice.status] || statusMap.draft;

  // Fetch full invoice details with lineItems and driver data
  const { data: fullInvoiceData, isLoading: detailLoading } = useQuery({
    queryKey: ['invoice-detail', invoice._id],
    queryFn: () => getInvoice(invoice._id),
    enabled: !!invoice._id,
    retry: 1,
  });
  const fullInvoice = fullInvoiceData?.data || null;

  const { mutate: changeStatus, isPending: changing } = useMutation({
    mutationFn: ({ status }) => updateStatus(invoice._id, { status }),
    onSuccess: () => {
      toast.success('Invoice status updated');
      qc.invalidateQueries(['invoices']);
      onClose();
    },
    onError: () => toast.error('Failed to update status'),
  });

  const { mutate: removeInvoice, isPending: deleting } = useMutation({
    mutationFn: () => deleteInvoice(invoice._id, invoice.status === 'paid' ? { remark: deleteRemark } : undefined),
    onSuccess: () => {
      toast.success('Invoice deleted');
      qc.invalidateQueries(['invoices']);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete invoice'),
  });

  const handleViewPdf = async () => {
    setViewingPdf(true);
    try {
      const blob = await downloadPdf(invoice._id);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch {
      toast.error('Failed to load PDF');
    } finally {
      setViewingPdf(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const blob = await downloadPdf(invoice._id);
      downloadBlob(blob, `${invoice.invoiceNo || invoice._id}.pdf`);
    } catch {
      toast.error('Failed to download PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <SidePanel onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{invoice.invoiceNo || invoice._id}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {invoice.client}{invoice.projectName ? ` · ${invoice.projectName}` : ''} &middot; {invoice.period}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 16 }}>&times;</button>
      </div>
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <InfoRow label="Amount" value={<span style={{ fontSize: 18, fontWeight: 600 }}>{formatCurrencyFull(invoice.amount)}</span>} />
          <InfoRow label="Status" value={<Badge variant={st.variant}>{st.label}</Badge>} />
          <InfoRow label="Issue date" value={formatDate(invoice.issueDate)} />
          <InfoRow label="Due date" value={formatDate(invoice.dueDate)} />
          <InfoRow label="Drivers" value={invoice.driverCount} />
          {fullInvoice?.lineItems?.length > 0 && (() => {
            const totalOrders = fullInvoice.lineItems.reduce((sum, item) => sum + (item.totalOrders || 0), 0);
            return totalOrders > 0 ? <InfoRow label="Total Orders" value={totalOrders.toLocaleString()} /> : null;
          })()}
          <InfoRow label="Collected Amount" value={<span style={{ color: invoice.amountReceived > 0 ? '#4ade80' : 'var(--text3)' }}>{formatCurrencyFull(invoice.amountReceived || 0)}</span>} />
          {invoice.paidAt && <InfoRow label="Paid on" value={formatDate(invoice.paidAt)} />}
        </div>

        {/* Adjusted total display */}
        {invoice.adjustedTotal != null && invoice.adjustedTotal !== invoice.amount && invoice.adjustedTotal !== (invoice.total ?? invoice.amount) && (
          <div style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12 }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <span>Original: <strong>{formatCurrencyFull(invoice.total ?? invoice.amount)}</strong></span>
              <span style={{ color: '#a78bfa' }}>Credit Notes: <strong>-{formatCurrencyFull((invoice.total ?? invoice.amount) - invoice.adjustedTotal)}</strong></span>
              <span>Adjusted: <strong>{formatCurrencyFull(invoice.adjustedTotal)}</strong></span>
            </div>
          </div>
        )}

        {/* Linked credit notes (standalone CN module) */}
        {invoice.linkedCreditNotes?.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Linked credit notes</div>
            {invoice.linkedCreditNotes.map((lcn) => (
              <div key={lcn._id || lcn.creditNoteNo} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 6, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#a78bfa' }}>{lcn.creditNoteNo}</span>
                <span style={{ fontWeight: 500 }}>{formatCurrencyFull(lcn.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Payment info */}
        {invoice.amountReceived > 0 && (
          <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12 }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <span>Received: <strong>{formatCurrencyFull(invoice.amountReceived)}</strong></span>
              {invoice.paymentReference && <span style={{ color: 'var(--text3)' }}>Ref: {invoice.paymentReference}</span>}
              {invoice.paymentVariance != null && invoice.paymentVariance !== 0 && (
                <span style={{ color: invoice.paymentVariance > 0 ? '#4ade80' : '#f87171' }}>
                  Variance: {formatCurrencyFull(invoice.paymentVariance)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Invoice line items — driver details */}
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: 'var(--text3)' }}>Loading invoice details...</div>
        ) : fullInvoice?.lineItems?.length > 0 ? (() => {
          const isPerOrder = fullInvoice.lineItems.some((item) => item.rateBasis === 'per_order');
          const hasOrders = fullInvoice.lineItems.some((item) => (item.totalOrders || 0) > 0);
          const qtyLabel = isPerOrder ? 'Total Orders' : 'Payable Days';
          const thStyle = (align = 'right') => ({ padding: '7px 8px', fontSize: 10, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: align, background: 'var(--surface2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' });
          const tdMono = { padding: '6px 8px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--mono)' };
          return (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Driver details ({fullInvoice.lineItems.length})</div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th style={thStyle('center')}>#</th>
                      <th style={thStyle('left')}>Driver</th>
                      <th style={thStyle('right')}>{qtyLabel}</th>
                      {!isPerOrder && hasOrders && <th style={thStyle('right')}>Orders</th>}
                      <th style={thStyle('right')}>Amount</th>
                      <th style={thStyle('right')}>VAT Amount</th>
                      <th style={thStyle('right')}>Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fullInvoice.lineItems.map((item, idx) => {
                      const qtyValue = item.rateBasis === 'per_order' ? (item.totalOrders || 0) : (item.workingDays || 0);
                      return (
                      <tr key={item._id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ padding: '6px 8px', fontSize: 12, textAlign: 'left' }}>
                          <div>{item.driverId?.fullName || item.driverName || '—'}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                            {item.driverId?.employeeCode || item.employeeCode || ''}
                            {item.driverId?.clientUserId ? ` · ${item.driverId.clientUserId}` : ''}
                          </div>
                        </td>
                        <td style={tdMono}>{qtyValue}</td>
                        {!isPerOrder && hasOrders && <td style={tdMono}>{item.totalOrders || 0}</td>}
                        <td style={tdMono}>{formatCurrencyFull(item.amount)}</td>
                        <td style={tdMono}>{formatCurrencyFull(item.vatAmount || 0)}</td>
                        <td style={{ ...tdMono, fontWeight: 500 }}>{formatCurrencyFull(item.totalWithVat || (item.amount + (item.vatAmount || 0)))}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Totals summary */}
              <div style={{ background: 'var(--surface2)', padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text3)' }}>Subtotal</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{formatCurrencyFull(fullInvoice.subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text3)' }}>VAT ({((fullInvoice.vatRate || 0.05) * 100).toFixed(0)}%)</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{formatCurrencyFull(fullInvoice.vatAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                  <span>Total</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{formatCurrencyFull(fullInvoice.total)}</span>
                </div>
              </div>
            </div>
          </div>
          );
        })() : fullInvoice && !fullInvoice.lineItems?.length ? (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 24, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8 }}>
            No driver line items found for this invoice.
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <PermissionGate permission="invoices.edit">
            {invoice.status === 'draft' && (
              <Btn variant="primary" onClick={() => changeStatus({ status: 'sent' })} disabled={changing}>Mark as sent</Btn>
            )}
            {(invoice.status === 'sent' || invoice.status === 'overdue') && (
              <>
                <Btn variant="success" onClick={() => changeStatus({ status: 'paid' })} disabled={changing}>Mark as paid</Btn>
                <Btn variant="primary" onClick={() => setShowPayment(true)}>Record payment</Btn>
              </>
            )}
          </PermissionGate>
          <PermissionGate permission="invoices.download">
            <Btn variant="ghost" onClick={handleViewPdf} disabled={viewingPdf}>
              {viewingPdf ? 'Loading...' : 'View PDF'}
            </Btn>
            <Btn variant="ghost" onClick={handleDownloadPdf} disabled={downloadingPdf}>
              {downloadingPdf ? 'Downloading...' : 'Download PDF'}
            </Btn>
          </PermissionGate>
          <PermissionGate permission="invoices.delete">
            {!confirmDelete ? (
              <Btn variant="danger" onClick={() => setConfirmDelete(true)}>Delete invoice</Btn>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                {invoice.status === 'paid' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: '#f87171', marginBottom: 4 }}>Remark (required for paid invoices)</label>
                    <input
                      type="text"
                      value={deleteRemark}
                      onChange={(e) => setDeleteRemark(e.target.value)}
                      placeholder="Reason for deleting this paid invoice..."
                      style={{ width: '100%', fontSize: 12 }}
                    />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#f87171' }}>Are you sure?</span>
                  <Btn variant="danger" onClick={() => removeInvoice()} disabled={deleting || (invoice.status === 'paid' && deleteRemark.trim().length < 3)}>{deleting ? 'Deleting...' : 'Yes, delete'}</Btn>
                  <Btn variant="ghost" onClick={() => { setConfirmDelete(false); setDeleteRemark(''); }} disabled={deleting}>Cancel</Btn>
                </div>
              </div>
            )}
          </PermissionGate>
        </div>
      </div>

      {showPayment && <PaymentModal invoice={invoice} onClose={() => { setShowPayment(false); onClose(); }} />}
    </SidePanel>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div>
  </div>
);

const PaymentModal = ({ invoice, onClose }) => {
  const { formatCurrencyFull } = useFormatters();
  const defaultAmount = invoice.adjustedTotal != null ? invoice.adjustedTotal : (invoice.total ?? invoice.amount);
  const [amountReceived, setAmountReceived] = useState(defaultAmount ? String(defaultAmount) : '');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const qc = useQueryClient();

  const expectedAmount = invoice.adjustedTotal != null ? invoice.adjustedTotal : (invoice.total ?? invoice.amount);

  const { mutate: doRecord, isPending } = useMutation({
    mutationFn: (data) => recordInvoicePayment(invoice._id, data),
    onSuccess: (res) => {
      const variance = res?.data?.paymentVariance;
      if (variance === 0) {
        toast.success('Payment recorded — invoice marked as paid');
      } else {
        toast.success(`Payment recorded — variance: ${variance} AED`);
      }
      qc.invalidateQueries(['invoices']);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to record payment'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amountReceived || parseFloat(amountReceived) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    doRecord({
      amountReceived: parseFloat(amountReceived),
      paymentReference,
      paymentDate,
    });
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title="Record payment" onClose={onClose} width={400}>
      <form onSubmit={handleSubmit}>
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
          Expected amount: <strong>{formatCurrencyFull(expectedAmount)}</strong>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Amount received (AED) *</label>
          <input type="number" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} placeholder="0.00" step="0.01" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Payment reference</label>
          <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Bank ref / cheque number" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Payment date</label>
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>
        {amountReceived && parseFloat(amountReceived) !== expectedAmount && (
          <div style={{ fontSize: 12, color: '#fbbf24', marginBottom: 14 }}>
            Variance: {formatCurrencyFull(parseFloat(amountReceived) - expectedAmount)} AED
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isPending}>{isPending ? 'Recording...' : 'Record payment'}</Btn>
        </div>
      </form>
    </Modal>
  );
};

const GenerateInvoiceModal = ({ onClose }) => {
  const { isMobile } = useBreakpoint();
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const qc = useQueryClient();

  const canFetchBatches = !!(clientId && year && month);

  const { data: batchesData, isLoading: batchesLoading, isError: batchesError } = useQuery({
    queryKey: ['approved-batches', clientId, projectId, year, month],
    queryFn: () => getApprovedBatches({
      clientId,
      ...(projectId && { projectId }),
      year: Number(year),
      month: Number(month),
    }),
    enabled: canFetchBatches,
    staleTime: 30 * 1000,
  });

  const approvedBatches = batchesData?.data || [];

  const handleClientChange = (val) => {
    setClientId(val);
    setProjectId('');
    setSelectedBatchIds([]);
  };

  const handleProjectChange = (val) => {
    setProjectId(val);
    setSelectedBatchIds([]);
  };

  const handlePeriodChange = (field, val) => {
    if (field === 'year') setYear(val);
    else setMonth(val);
    setSelectedBatchIds([]);
  };

  const toggleBatch = (batchId) => {
    setSelectedBatchIds((prev) =>
      prev.includes(batchId) ? prev.filter((id) => id !== batchId) : [...prev, batchId]
    );
  };

  const toggleAllBatches = () => {
    if (selectedBatchIds.length === approvedBatches.length) {
      setSelectedBatchIds([]);
    } else {
      setSelectedBatchIds(approvedBatches.map((b) => b._id));
    }
  };

  const { mutate: generate, isPending: isLoading } = useMutation({
    mutationFn: (data) => generateInvoice(data),
    onSuccess: () => {
      toast.success('Invoice generated');
      qc.invalidateQueries(['invoices']);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to generate invoice'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!clientId) { toast.error('Please select a client'); return; }
    const payload = { clientId, year: Number(year), month: Number(month) };
    if (projectId) payload.projectId = projectId;
    if (selectedBatchIds.length > 0) payload.attendanceBatchIds = selectedBatchIds;
    generate(payload);
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title="Generate invoice" onClose={onClose} width={520}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Client *</label>
          <ClientSelect value={clientId} onChange={handleClientChange} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Project</label>
          <ProjectSelect value={projectId} onChange={handleProjectChange} clientId={clientId} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Year *</label>
            <input type="number" value={year} onChange={(e) => handlePeriodChange('year', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Month *</label>
            <select value={month} onChange={(e) => handlePeriodChange('month', e.target.value)} style={{ width: '100%' }}>
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {canFetchBatches && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Attendance batches</label>
              {approvedBatches.length > 0 && (
                <button type="button" onClick={toggleAllBatches} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 11, cursor: 'pointer', padding: 0 }}>
                  {selectedBatchIds.length === approvedBatches.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>
            {batchesLoading ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>Loading batches...</div>
            ) : batchesError ? (
              <div style={{ fontSize: 12, color: 'var(--danger, #ef4444)', padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                Failed to load attendance batches. Please try again.
              </div>
            ) : approvedBatches.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                No approved attendance batches found for this selection.
              </div>
            ) : (
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {approvedBatches.map((batch) => (
                  <label
                    key={batch._id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12,
                      background: selectedBatchIds.includes(batch._id) ? 'rgba(99,102,241,0.08)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedBatchIds.includes(batch._id)}
                      onChange={() => toggleBatch(batch._id)}
                      style={{ margin: 0, width: 'auto', minHeight: 'auto', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>{batch.batchId}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
                        {batch.projectId?.name || 'Unknown project'} &middot; {batch.period ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][(batch.period.month || 1) - 1]} ${batch.period.year}` : '—'} &middot; {batch.matchedRows ?? batch.totalRows ?? '—'} records
                      </div>
                    </div>
                    <Badge variant="success" style={{ fontSize: 10 }}>Approved</Badge>
                  </label>
                ))}
              </div>
            )}
            {selectedBatchIds.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                {selectedBatchIds.length} batch{selectedBatchIds.length > 1 ? 'es' : ''} selected
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isLoading}>{isLoading ? 'Generating...' : 'Generate'}</Btn>
        </div>
      </form>
    </Modal>
  );
};

export default Invoices;
