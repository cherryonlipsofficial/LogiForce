import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import SidePanel from '../../components/ui/SidePanel';
import ClientSelect from '../../components/ui/ClientSelect';
import { getInvoices, generateInvoice, updateStatus, addCreditNote, downloadPdf } from '../../api/invoicesApi';
import { formatDate, formatCurrencyFull } from '../../utils/formatters';

const fallbackInvoices = [
  { _id: 'INV-2026-001', client: 'Amazon UAE', period: 'Mar 2026', amount: 892400, status: 'draft', issueDate: '2026-03-21T00:00:00Z', dueDate: '2026-04-20T00:00:00Z', driverCount: 342, creditNotes: [] },
  { _id: 'INV-2026-002', client: 'Noon', period: 'Mar 2026', amount: 558700, status: 'sent', issueDate: '2026-03-20T00:00:00Z', dueDate: '2026-04-19T00:00:00Z', driverCount: 218, creditNotes: [] },
  { _id: 'INV-2026-003', client: 'Talabat', period: 'Mar 2026', amount: 389200, status: 'sent', issueDate: '2026-03-19T00:00:00Z', dueDate: '2026-04-18T00:00:00Z', driverCount: 156, creditNotes: [{ amount: 4500, reason: 'Attendance correction' }] },
  { _id: 'INV-2026-004', client: 'Amazon UAE', period: 'Feb 2026', amount: 884100, status: 'paid', issueDate: '2026-02-20T00:00:00Z', dueDate: '2026-03-22T00:00:00Z', driverCount: 340, paidAt: '2026-03-18T00:00:00Z', creditNotes: [] },
  { _id: 'INV-2026-005', client: 'Noon', period: 'Feb 2026', amount: 549300, status: 'paid', issueDate: '2026-02-19T00:00:00Z', dueDate: '2026-03-21T00:00:00Z', driverCount: 215, paidAt: '2026-03-15T00:00:00Z', creditNotes: [] },
  { _id: 'INV-2026-006', client: 'Talabat', period: 'Feb 2026', amount: 378900, status: 'overdue', issueDate: '2026-02-18T00:00:00Z', dueDate: '2026-03-20T00:00:00Z', driverCount: 154, creditNotes: [] },
];

const statusMap = {
  draft: { label: 'Draft', variant: 'default' },
  sent: { label: 'Sent', variant: 'info' },
  paid: { label: 'Paid', variant: 'success' },
  overdue: { label: 'Overdue', variant: 'danger' },
  cancelled: { label: 'Cancelled', variant: 'default' },
};

const Invoices = () => {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showGenerate, setShowGenerate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => getInvoices(),
    retry: 1,
  });

  const invoices = data?.data || fallbackInvoices;
  const filtered = statusFilter === 'all' ? invoices : invoices.filter((i) => i.status === statusFilter);

  const totalOutstanding = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.amount, 0);
  const totalPaid = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const overdueCount = invoices.filter((i) => i.status === 'overdue').length;

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total invoices" value={invoices.length} />
        <KpiCard label="Outstanding" value={formatCurrencyFull(totalOutstanding)} color="#fbbf24" />
        <KpiCard label="Collected" value={formatCurrencyFull(totalPaid)} color="#4ade80" />
        <KpiCard label="Overdue" value={overdueCount} color={overdueCount > 0 ? '#f87171' : '#4ade80'} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 180, height: 34 }}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Btn small variant="primary" onClick={() => setShowGenerate(true)}>Generate invoice</Btn>
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
                  {['Invoice', 'Client', 'Period', 'Amount', 'Status', 'Issue date', 'Due date', 'Credit notes'].map((h) => (
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
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{inv._id}</span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{inv.client}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{inv.period}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{formatCurrencyFull(inv.amount)}</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}><Badge variant={st.variant}>{st.label}</Badge></td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--text3)' }}>{formatDate(inv.issueDate)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: inv.status === 'overdue' ? '#f87171' : 'var(--text3)' }}>{formatDate(inv.dueDate)}</td>
                      <td style={{ padding: '11px 14px' }}>
                        {inv.creditNotes?.length > 0 ? (
                          <Badge variant="purple">{inv.creditNotes.length}</Badge>
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

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
          Showing {filtered.length} of {invoices.length} invoices
        </div>
      </div>

      {selectedInvoice && <InvoiceDetail invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />}
      {showGenerate && <GenerateInvoiceModal onClose={() => setShowGenerate(false)} />}
    </div>
  );
};

const InvoiceDetail = ({ invoice, onClose }) => {
  const qc = useQueryClient();
  const [showCreditNote, setShowCreditNote] = useState(false);
  const st = statusMap[invoice.status] || statusMap.draft;

  const { mutate: changeStatus, isLoading: changing } = useMutation({
    mutationFn: ({ status }) => updateStatus(invoice._id, { status }),
    onSuccess: () => {
      toast.success('Invoice status updated');
      qc.invalidateQueries(['invoices']);
      onClose();
    },
    onError: () => toast.error('Failed to update status'),
  });

  const handleDownloadPdf = async () => {
    try {
      const blob = await downloadPdf(invoice._id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice._id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download PDF');
    }
  };

  return (
    <SidePanel onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{invoice._id}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{invoice.client} &middot; {invoice.period}</div>
        </div>
        <button onClick={onClose} style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 16 }}>&times;</button>
      </div>
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <InfoRow label="Amount" value={<span style={{ fontSize: 18, fontWeight: 600 }}>{formatCurrencyFull(invoice.amount)}</span>} />
          <InfoRow label="Status" value={<Badge variant={st.variant}>{st.label}</Badge>} />
          <InfoRow label="Issue date" value={formatDate(invoice.issueDate)} />
          <InfoRow label="Due date" value={formatDate(invoice.dueDate)} />
          <InfoRow label="Drivers" value={invoice.driverCount} />
          {invoice.paidAt && <InfoRow label="Paid on" value={formatDate(invoice.paidAt)} />}
        </div>

        {invoice.creditNotes?.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Credit notes</div>
            {invoice.creditNotes.map((cn, i) => (
              <div key={i} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: '#a78bfa', fontWeight: 500 }}>{formatCurrencyFull(cn.amount)}</span>
                <span style={{ color: 'var(--text3)', marginLeft: 8 }}>{cn.reason}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {invoice.status === 'draft' && (
            <Btn variant="primary" onClick={() => changeStatus({ status: 'sent' })} disabled={changing}>Mark as sent</Btn>
          )}
          {(invoice.status === 'sent' || invoice.status === 'overdue') && (
            <Btn variant="success" onClick={() => changeStatus({ status: 'paid' })} disabled={changing}>Mark as paid</Btn>
          )}
          <Btn variant="ghost" onClick={handleDownloadPdf}>Download PDF</Btn>
          <Btn variant="ghost" onClick={() => setShowCreditNote(true)}>Add credit note</Btn>
        </div>
      </div>

      {showCreditNote && <CreditNoteModal invoiceId={invoice._id} onClose={() => { setShowCreditNote(false); onClose(); }} />}
    </SidePanel>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div>
  </div>
);

const CreditNoteModal = ({ invoiceId, onClose }) => {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [driverId, setDriverId] = useState('');
  const qc = useQueryClient();

  const { mutate: add, isLoading } = useMutation({
    mutationFn: (data) => addCreditNote(invoiceId, data),
    onSuccess: () => {
      toast.success('Credit note added');
      qc.invalidateQueries(['invoices']);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to add credit note'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || !reason || !driverId) { toast.error('Please fill all fields'); return; }
    add({ driverId, amount: Number(amount), reason });
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title="Add credit note" onClose={onClose} width={400}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Driver ID *</label>
          <input value={driverId} onChange={(e) => setDriverId(e.target.value)} placeholder="Driver ObjectId" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Amount (AED) *</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="4500" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Reason *</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Attendance correction" />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isLoading}>{isLoading ? 'Adding...' : 'Add credit note'}</Btn>
        </div>
      </form>
    </Modal>
  );
};

const GenerateInvoiceModal = ({ onClose }) => {
  const [clientId, setClientId] = useState('');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const qc = useQueryClient();

  const { mutate: generate, isLoading } = useMutation({
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
    generate({ clientId, year: Number(year), month: Number(month) });
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title="Generate invoice" onClose={onClose} width={420}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Client *</label>
          <ClientSelect value={clientId} onChange={setClientId} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Year *</label>
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Month *</label>
            <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: '100%' }}>
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isLoading}>{isLoading ? 'Generating...' : 'Generate'}</Btn>
        </div>
      </form>
    </Modal>
  );
};

export default Invoices;
