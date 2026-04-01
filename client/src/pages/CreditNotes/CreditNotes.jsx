import { useState, useEffect } from 'react';
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
import Pagination from '../../components/ui/Pagination';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { downloadBlob } from '../../utils/downloadBlob';
import { formatDate, formatCurrencyFull } from '../../utils/formatters';
import {
  getCreditNotes,
  getCreditNote,
  createCreditNote,
  sendCreditNote,
  adjustCreditNote,
  resolveLine,
  deleteCreditNote,
  downloadCreditNotePdf,
  getSettlementSummary,
} from '../../api/creditNotesApi';
import { getInvoices } from '../../api/invoicesApi';
import axiosInstance from '../../api/axiosInstance';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const statusMap = {
  draft: { label: 'Draft', variant: 'warning' },
  sent: { label: 'Sent', variant: 'info' },
  adjusted: { label: 'Adjusted', variant: 'purple' },
  settled: { label: 'Settled', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
};

const noteTypeLabels = {
  traffic_fine: 'Traffic Fine',
  penalty: 'Penalty',
  damage: 'Damage',
  client_chargeback: 'Client Chargeback',
  attendance_correction: 'Attendance Correction',
  excess_insurance: 'Excess Insurance',
  salik: 'Salik',
  tots: 'TOTS',
  accident_report: 'Accident Report',
  misuse: 'Misuse',
  cod: 'COD',
  other: 'Other',
};

const CreditNotes = () => {
  const { isMobile, isTablet } = useBreakpoint();
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCN, setSelectedCN] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['credit-notes', { status: statusFilter, page }],
    queryFn: () => getCreditNotes({ status: statusFilter !== 'all' ? statusFilter : undefined, page, limit: 20 }),
    retry: 1,
  });

  const { data: summaryData } = useQuery({
    queryKey: ['credit-notes-summary'],
    queryFn: () => getSettlementSummary(),
    retry: 1,
  });

  const creditNotes = data?.data || [];
  const pagination = data?.pagination;
  const summary = summaryData?.data || {};

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total credit notes" value={summary.total || 0} />
        <KpiCard label="Total amount" value={formatCurrencyFull(summary.totalAmount || 0)} color="#a78bfa" />
        <KpiCard label="Settled" value={summary.settled || 0} color="#4ade80" />
        <KpiCard label="Pending action" value={summary.pending || 0} color={summary.pending > 0 ? '#fbbf24' : '#4ade80'} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)', flexDirection: isMobile ? 'column' : 'row' }}>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ width: 180, height: 34 }}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="adjusted">Adjusted</option>
            <option value="settled">Settled</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <PermissionGate permission="credit_notes.create">
              <Btn small variant="primary" onClick={() => setShowCreate(true)}>Create credit note</Btn>
            </PermissionGate>
          </div>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : creditNotes.length === 0 ? (
          <EmptyState title="No credit notes" message="Create a credit note to get started." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {['CN No', 'Client', 'Project', 'Period', 'Type', 'Amount', 'Status', 'Created'].map((h) => (
                    <th key={h} style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', background: 'var(--surface2)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {creditNotes.map((cn) => {
                  const st = statusMap[cn.status] || statusMap.draft;
                  const periodStr = cn.period ? `${MONTHS[(cn.period.month || 1) - 1]} ${cn.period.year}` : '—';
                  return (
                    <tr
                      key={cn._id}
                      onClick={() => setSelectedCN(cn)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{cn.creditNoteNo || cn._id}</span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{cn.clientId?.name || '—'}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{cn.projectId?.name || '—'}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{periodStr}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{(() => {
                        const types = [...new Set((cn.lineItems || []).map(l => l.noteType).filter(Boolean))];
                        if (types.length === 0) return '—';
                        if (types.length === 1) return noteTypeLabels[types[0]] || types[0];
                        return <span title={types.map(t => noteTypeLabels[t] || t).join(', ')}>Mixed ({types.length})</span>;
                      })()}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{formatCurrencyFull(cn.totalAmount)}</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}><Badge variant={st.variant}>{st.label}</Badge></td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--text3)' }}>{formatDate(cn.createdAt)}</td>
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
          total={pagination?.total ?? creditNotes.length}
          pageSize={pagination?.limit || 20}
          onPageChange={setPage}
        />
      </div>

      {selectedCN && <CreditNoteDetail cnId={selectedCN._id} onClose={() => setSelectedCN(null)} />}
      {showCreate && <CreateCreditNoteModal onClose={() => setShowCreate(false)} />}
    </div>
  );
};

const CreditNoteDetail = ({ cnId, onClose }) => {
  const { isMobile } = useBreakpoint();
  const qc = useQueryClient();
  const [showLinkInvoice, setShowLinkInvoice] = useState(false);
  const [resolveLineId, setResolveLineId] = useState(null);
  const [resolveNote, setResolveNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const { data: cnData, isLoading } = useQuery({
    queryKey: ['credit-note', cnId],
    queryFn: () => getCreditNote(cnId),
  });

  const cn = cnData?.data;

  const { mutate: doSend, isPending: sending } = useMutation({
    mutationFn: () => sendCreditNote(cnId),
    onSuccess: () => {
      toast.success('Credit note sent');
      qc.invalidateQueries(['credit-notes']);
      qc.invalidateQueries(['credit-note', cnId]);
      qc.invalidateQueries(['credit-notes-summary']);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to send'),
  });

  const { mutate: doDelete, isPending: deleting } = useMutation({
    mutationFn: () => deleteCreditNote(cnId),
    onSuccess: () => {
      toast.success('Credit note deleted');
      qc.invalidateQueries(['credit-notes']);
      qc.invalidateQueries(['credit-notes-summary']);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
  });

  const { mutate: doResolve, isPending: resolving } = useMutation({
    mutationFn: ({ lineId, note }) => resolveLine(cnId, lineId, { note }),
    onSuccess: () => {
      toast.success('Line resolved');
      setResolveLineId(null);
      setResolveNote('');
      qc.invalidateQueries(['credit-note', cnId]);
      qc.invalidateQueries(['credit-notes']);
      qc.invalidateQueries(['credit-notes-summary']);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to resolve'),
  });

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const blob = await downloadCreditNotePdf(cnId);
      downloadBlob(blob, `${cn?.creditNoteNo || cnId}.pdf`);
    } catch {
      toast.error('Failed to download PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (isLoading || !cn) {
    return (
      <SidePanel onClose={onClose}>
        <div style={{ padding: 24 }}><LoadingSpinner /></div>
      </SidePanel>
    );
  }

  const st = statusMap[cn.status] || statusMap.draft;
  const periodStr = cn.period ? `${MONTHS[(cn.period.month || 1) - 1]} ${cn.period.year}` : '—';
  const linesSettled = cn.lineItems?.filter(l => l.salaryDeducted || l.manuallyResolved).length || 0;
  const linesTotal = cn.lineItems?.length || 0;

  return (
    <SidePanel onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{cn.creditNoteNo}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {cn.clientId?.name || '—'} · {cn.projectId?.name || '—'} · {periodStr}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 16 }}>&times;</button>
      </div>

      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <InfoRow label="Status" value={<Badge variant={st.variant}>{st.label}</Badge>} />
          <InfoRow label="Amount" value={<span style={{ fontSize: 18, fontWeight: 600 }}>{formatCurrencyFull(cn.totalAmount)}</span>} />
          <InfoRow label="Description" value={cn.description} />
          {cn.linkedInvoiceId && (
            <InfoRow label="Linked invoice" value={cn.linkedInvoiceId.invoiceNo || '—'} />
          )}
          <InfoRow label="Created by" value={cn.createdBy?.name || '—'} />
        </div>

        {/* Settlement progress */}
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Settlement progress</div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <div>
              <span style={{ color: 'var(--text3)' }}>Client side: </span>
              {cn.linkedInvoiceId ? (
                <Badge variant="success">Adjusted</Badge>
              ) : (
                <Badge variant="warning">Pending</Badge>
              )}
            </div>
            <div>
              <span style={{ color: 'var(--text3)' }}>Driver side: </span>
              <span style={{ fontWeight: 500 }}>{linesSettled} of {linesTotal} settled</span>
            </div>
          </div>
        </div>

        {/* Line items table */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Line items</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Driver', 'Type', 'EMP ID', 'Ref/Plate', 'Amount', 'VAT', 'Total', 'Salary status'].map((h) => (
                    <th key={h} style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text3)', fontWeight: 500, textAlign: 'left', background: 'var(--surface2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(cn.lineItems || []).map((line) => {
                  const driverStatus = line.driverId?.status;
                  const isResigned = ['resigned', 'offboarded'].includes(driverStatus);
                  let salaryStatus;
                  if (line.salaryDeducted) salaryStatus = { label: 'Deducted', variant: 'success' };
                  else if (line.manuallyResolved) salaryStatus = { label: 'Resolved', variant: 'purple' };
                  else if (isResigned) salaryStatus = { label: 'Unrecoverable', variant: 'danger' };
                  else salaryStatus = { label: 'Pending', variant: 'warning' };

                  return (
                    <tr key={line._id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 8px' }}>
                        <div>{line.driverName}</div>
                        {line.clientUserId && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{line.clientUserId}</div>}
                      </td>
                      <td style={{ padding: '8px 8px', fontSize: 11 }}>{noteTypeLabels[line.noteType] || line.noteType || '—'}</td>
                      <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', fontSize: 11 }}>{line.employeeCode || '—'}</td>
                      <td style={{ padding: '8px 8px' }}>{line.referenceNo || '—'}</td>
                      <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)' }}>{formatCurrencyFull(line.amount)}</td>
                      <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)' }}>{formatCurrencyFull(line.vatAmount)}</td>
                      <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', fontWeight: 500 }}>{formatCurrencyFull(line.totalWithVat)}</td>
                      <td style={{ padding: '8px 8px' }}>
                        <Badge variant={salaryStatus.variant}>{salaryStatus.label}</Badge>
                        {isResigned && !line.salaryDeducted && !line.manuallyResolved && (
                          <PermissionGate permission="credit_notes.settle">
                            {resolveLineId === line._id ? (
                              <div style={{ marginTop: 4 }}>
                                <input
                                  value={resolveNote}
                                  onChange={(e) => setResolveNote(e.target.value)}
                                  placeholder="Resolution note..."
                                  style={{ fontSize: 11, width: '100%', marginBottom: 4 }}
                                />
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <Btn small variant="primary" onClick={() => doResolve({ lineId: line._id, note: resolveNote })} disabled={resolving || resolveNote.trim().length < 3}>Resolve</Btn>
                                  <Btn small variant="ghost" onClick={() => { setResolveLineId(null); setResolveNote(''); }}>Cancel</Btn>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setResolveLineId(line._id); }}
                                style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: 2, display: 'block' }}
                              >
                                Resolve manually
                              </button>
                            )}
                          </PermissionGate>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 8, fontSize: 12 }}>
            <span style={{ color: 'var(--text3)' }}>Subtotal: <strong>{formatCurrencyFull(cn.subtotal)}</strong></span>
            <span style={{ color: 'var(--text3)' }}>VAT: <strong>{formatCurrencyFull(cn.totalVat)}</strong></span>
            <span style={{ fontWeight: 600 }}>Total: {formatCurrencyFull(cn.totalAmount)}</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {cn.status === 'draft' && (
            <PermissionGate permission="credit_notes.send">
              <Btn variant="primary" onClick={() => doSend()} disabled={sending}>{sending ? 'Sending...' : 'Send to client'}</Btn>
            </PermissionGate>
          )}
          {cn.status === 'sent' && (
            <PermissionGate permission="credit_notes.adjust">
              <Btn variant="primary" onClick={() => setShowLinkInvoice(true)}>Link to invoice</Btn>
            </PermissionGate>
          )}
          <PermissionGate permission="credit_notes.download">
            <Btn variant="ghost" onClick={handleDownloadPdf} disabled={downloadingPdf}>
              {downloadingPdf ? 'Downloading...' : 'Download PDF'}
            </Btn>
          </PermissionGate>
          {cn.status === 'draft' && (
            <PermissionGate permission="credit_notes.delete">
              {!confirmDelete ? (
                <Btn variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Btn>
              ) : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#f87171' }}>Are you sure?</span>
                  <Btn variant="danger" onClick={() => doDelete()} disabled={deleting}>{deleting ? 'Deleting...' : 'Yes, delete'}</Btn>
                  <Btn variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Btn>
                </div>
              )}
            </PermissionGate>
          )}
        </div>
      </div>

      {showLinkInvoice && (
        <LinkInvoiceModal
          cnId={cnId}
          clientId={cn.clientId?._id || cn.clientId}
          onClose={() => {
            setShowLinkInvoice(false);
            qc.invalidateQueries(['credit-note', cnId]);
            qc.invalidateQueries(['credit-notes']);
            qc.invalidateQueries(['credit-notes-summary']);
          }}
        />
      )}
    </SidePanel>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div>
  </div>
);

const LinkInvoiceModal = ({ cnId, clientId, onClose }) => {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const qc = useQueryClient();

  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ['invoices-for-link', clientId],
    queryFn: () => getInvoices({ clientId, limit: 50 }),
    enabled: !!clientId,
  });

  const invoices = (invoicesData?.data || []).filter(
    (inv) => ['draft', 'sent'].includes(inv.status)
  );

  const { mutate: doAdjust, isPending } = useMutation({
    mutationFn: () => adjustCreditNote(cnId, { invoiceId: selectedInvoiceId }),
    onSuccess: () => {
      toast.success('Credit note linked to invoice');
      qc.invalidateQueries(['invoices']);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to link'),
  });

  return (
    <Modal title="Link to invoice" onClose={onClose} width={460}>
      {isLoading ? (
        <LoadingSpinner />
      ) : invoices.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text3)', padding: '10px 0' }}>No eligible invoices found for this client.</div>
      ) : (
        <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
          {invoices.map((inv) => (
            <label
              key={inv._id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12,
                background: selectedInvoiceId === inv._id ? 'rgba(99,102,241,0.08)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="invoice"
                checked={selectedInvoiceId === inv._id}
                onChange={() => setSelectedInvoiceId(inv._id)}
                style={{ margin: 0, width: 'auto', minHeight: 'auto', flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{inv.invoiceNo || inv._id}</span>
                <span style={{ color: 'var(--text3)', marginLeft: 8 }}>
                  {formatCurrencyFull(inv.total ?? inv.amount)}
                </span>
              </div>
              <Badge variant={inv.status === 'sent' ? 'info' : 'default'}>{inv.status}</Badge>
            </label>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={() => doAdjust()} disabled={isPending || !selectedInvoiceId}>
          {isPending ? 'Linking...' : 'Link'}
        </Btn>
      </div>
    </Modal>
  );
};

const CreateCreditNoteModal = ({ onClose }) => {
  const { isMobile } = useBreakpoint();
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [description, setDescription] = useState('');
  const [lineItems, setLineItems] = useState([{ driverId: '', driverSearch: '', noteType: 'traffic_fine', referenceNo: '', amount: '', vatRate: '0' }]);
  const [driverResults, setDriverResults] = useState({});
  const [searchingDriver, setSearchingDriver] = useState({});
  const qc = useQueryClient();

  const addLine = () => setLineItems([...lineItems, { driverId: '', driverSearch: '', noteType: 'traffic_fine', referenceNo: '', amount: '', vatRate: '0' }]);
  const removeLine = (idx) => setLineItems(lineItems.filter((_, i) => i !== idx));
  const updateLine = (idx, field, value) => {
    setLineItems((prev) => {
      const items = [...prev];
      items[idx] = { ...items[idx], [field]: value };
      return items;
    });
  };

  const searchDrivers = async (idx, query) => {
    if (!query || query.length < 2) {
      setDriverResults((prev) => ({ ...prev, [idx]: [] }));
      return;
    }
    setSearchingDriver((prev) => ({ ...prev, [idx]: true }));
    try {
      const res = await axiosInstance.get('/drivers', { params: { search: query, limit: 10, projectId: projectId || undefined } });
      const drivers = res.data?.data || [];
      setDriverResults((prev) => ({ ...prev, [idx]: drivers }));
    } catch {
      setDriverResults((prev) => ({ ...prev, [idx]: [] }));
    } finally {
      setSearchingDriver((prev) => ({ ...prev, [idx]: false }));
    }
  };

  const selectDriver = (idx, driver) => {
    updateLine(idx, 'driverId', driver._id);
    updateLine(idx, 'driverSearch', `${driver.fullName} (${driver.employeeCode || driver._id})`);
    setDriverResults((prev) => ({ ...prev, [idx]: [] }));
  };

  const subtotal = lineItems.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const totalVat = lineItems.reduce((s, l) => {
    const amt = parseFloat(l.amount) || 0;
    const vr = parseFloat(l.vatRate) || 0;
    return s + amt * vr;
  }, 0);
  const totalAmount = subtotal + totalVat;

  const { mutate: doCreate, isPending } = useMutation({
    mutationFn: (data) => createCreditNote(data),
    onSuccess: () => {
      toast.success('Credit note created');
      qc.invalidateQueries(['credit-notes']);
      qc.invalidateQueries(['credit-notes-summary']);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create credit note'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!clientId || !projectId) {
      toast.error('Please fill all required fields');
      return;
    }
    const validLines = lineItems.filter((l) => l.driverId && l.amount);
    if (validLines.length === 0) {
      toast.error('At least one line item with driver and amount is required');
      return;
    }
    doCreate({
      clientId,
      projectId,
      year: Number(year),
      month: Number(month),
      description,
      lineItems: validLines.map((l) => ({
        driverId: l.driverId,
        noteType: l.noteType,
        referenceNo: l.referenceNo,
        amount: parseFloat(l.amount),
        vatRate: parseFloat(l.vatRate) || 0,
      })),
    });
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title="Create credit note" onClose={onClose} width={720}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Client *</label>
            <ClientSelect value={clientId} onChange={(v) => { setClientId(v); setProjectId(''); }} />
          </div>
          <div>
            <label style={labelStyle}>Project *</label>
            <ProjectSelect value={projectId} onChange={setProjectId} clientId={clientId} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Year *</label>
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Month *</label>
            <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: '100%' }}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Description *</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Credit Note - Traffic Fine" />
        </div>

        {/* Line items */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Line items *</label>
            <button type="button" onClick={addLine} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer' }}>+ Add driver line</button>
          </div>
          <div style={{ minHeight: 120, border: '1px solid var(--border)', borderRadius: 8, padding: 8, paddingBottom: 16 }}>
            {lineItems.map((line, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1fr auto', gap: 6, marginBottom: 8, alignItems: 'end' }}>
                <div style={{ position: 'relative' }}>
                  {idx === 0 && <label style={{ fontSize: 10, color: 'var(--text3)' }}>Driver</label>}
                  <input
                    value={line.driverSearch}
                    onChange={(e) => {
                      updateLine(idx, 'driverSearch', e.target.value);
                      updateLine(idx, 'driverId', '');
                      searchDrivers(idx, e.target.value);
                    }}
                    placeholder="Search driver..."
                    style={{ fontSize: 11 }}
                  />
                  {(driverResults[idx]?.length > 0) && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, zIndex: 20, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                      {driverResults[idx].map((d) => (
                        <div
                          key={d._id}
                          onClick={() => selectDriver(idx, d)}
                          style={{ padding: '6px 8px', fontSize: 11, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface2)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          {d.fullName} <span style={{ color: 'var(--text3)' }}>({d.employeeCode || d._id})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  {idx === 0 && <label style={{ fontSize: 10, color: 'var(--text3)' }}>Type</label>}
                  <select value={line.noteType} onChange={(e) => updateLine(idx, 'noteType', e.target.value)} style={{ width: '100%', fontSize: 11 }}>
                    {Object.entries(noteTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  {idx === 0 && <label style={{ fontSize: 10, color: 'var(--text3)' }}>Ref/Plate</label>}
                  <input value={line.referenceNo} onChange={(e) => updateLine(idx, 'referenceNo', e.target.value)} placeholder="Ref..." style={{ fontSize: 11 }} />
                </div>
                <div>
                  {idx === 0 && <label style={{ fontSize: 10, color: 'var(--text3)' }}>Amount</label>}
                  <input type="number" value={line.amount} onChange={(e) => updateLine(idx, 'amount', e.target.value)} placeholder="0.00" style={{ fontSize: 11 }} />
                </div>
                <div>
                  {idx === 0 && <label style={{ fontSize: 10, color: 'var(--text3)' }}>VAT Rate</label>}
                  <input type="number" value={line.vatRate} onChange={(e) => updateLine(idx, 'vatRate', e.target.value)} placeholder="0" step="0.01" style={{ fontSize: 11 }} />
                </div>
                <button type="button" onClick={() => removeLine(idx)} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 14, cursor: 'pointer', padding: '4px' }} title="Remove">×</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 8, fontSize: 12 }}>
            <span style={{ color: 'var(--text3)' }}>Subtotal: <strong>{formatCurrencyFull(subtotal)}</strong></span>
            <span style={{ color: 'var(--text3)' }}>VAT: <strong>{formatCurrencyFull(totalVat)}</strong></span>
            <span style={{ fontWeight: 600 }}>Total: {formatCurrencyFull(totalAmount)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isPending}>{isPending ? 'Creating...' : 'Create'}</Btn>
        </div>
      </form>
    </Modal>
  );
};

export default CreditNotes;
