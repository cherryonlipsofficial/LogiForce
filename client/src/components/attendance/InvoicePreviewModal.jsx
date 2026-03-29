import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import { generateInvoice } from '../../api/attendanceApi';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const VAT_RATE = 0.05;

const InvoicePreviewModal = ({ batch, onClose, onSuccess }) => {
  const { isMobile } = useBreakpoint();
  const [apiError, setApiError] = useState('');
  const qc = useQueryClient();

  const { mutate: generate, isLoading } = useMutation({
    mutationFn: () => generateInvoice(batch._id),
    onSuccess: (res) => {
      const inv = res?.data || res;
      toast.success(`Invoice ${inv.invoiceNo || ''} generated — AED ${Number(inv.total || 0).toLocaleString()}`);
      qc.invalidateQueries(['attendance-batches']);
      qc.invalidateQueries(['invoices']);
      onSuccess?.();
      onClose();
    },
    onError: (err) => setApiError(err.response?.data?.message || 'Failed to generate invoice'),
  });

  const monthName = batch.period?.month
    ? MONTHS[(batch.period.month || 1) - 1]
    : (typeof batch.period === 'string' ? batch.period.split(' ')[0] : '');
  const year = batch.period?.year || (typeof batch.period === 'string' ? batch.period.split(' ')[1] : '');
  const clientName = batch.clientId?.name || batch.client || 'Unknown';

  const { projectGroups, subtotal, noProjectCount, hasProjectData } = useMemo(() => {
    const records = batch.records || batch.attendanceRecords || [];
    if (records.length === 0) {
      return { projectGroups: [], subtotal: 0, noProjectCount: 0, hasProjectData: false };
    }

    const groups = {};
    let noProjCount = 0;

    records.forEach(r => {
      const project = r.projectId || r.project;
      if (!project) { noProjCount++; return; }
      const key = project._id || project.name || 'unknown';
      if (!groups[key]) {
        groups[key] = {
          name: project.name || 'Unknown project',
          code: project.code || project.projectCode || '',
          rate: project.ratePerDriver || project.monthlyRate || 0,
          dailyRate: project.dailyRate || 0,
          drivers: 0,
          subtotal: 0,
        };
      }
      groups[key].drivers += 1;
      groups[key].subtotal += (project.ratePerDriver || project.monthlyRate || 0);
    });

    const groupList = Object.values(groups);
    const sub = groupList.reduce((sum, g) => sum + g.subtotal, 0);
    return { projectGroups: groupList, subtotal: sub, noProjectCount: noProjCount, hasProjectData: groupList.length > 0 };
  }, [batch]);

  const vatAmount = subtotal * VAT_RATE;
  const total = subtotal + vatAmount;

  const thStyle = { padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textAlign: 'left', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' };
  const tdStyle = { padding: '7px 12px', fontSize: 12, borderBottom: '1px solid var(--border)' };

  return (
    <Modal title="Generate invoice — preview" onClose={onClose} width={600}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Client</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{clientName}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Period</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{monthName} {year}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Project</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>
            {batch.projectId?.name || batch.project || 'N/A'}
            {(batch.projectId?.projectCode || batch.projectCode) && (
              <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>
                {batch.projectId?.projectCode || batch.projectCode}
              </span>
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Invoice no</div>
          <div style={{ fontSize: 12, marginTop: 2, color: 'var(--text3)', fontStyle: 'italic' }}>
            Will be assigned on creation
          </div>
        </div>
      </div>

      {hasProjectData ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Project</th>
                <th style={thStyle}>Rate/driver</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Drivers</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {projectGroups.map((g, i) => (
                <tr key={i}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{g.name}</div>
                    {g.code && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{g.code}</div>}
                  </td>
                  <td style={tdStyle}>
                    <div>AED {Number(g.rate).toLocaleString()}/month</div>
                    {g.dailyRate > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>AED {Number(g.dailyRate).toLocaleString()}/day</div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{g.drivers}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    AED {Number(g.subtotal).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#fbbf24',
        }}>
          Some drivers may not have project assignments. The invoice will only include drivers with assigned projects.
        </div>
      )}

      <div style={{
        background: 'var(--surface2)', borderRadius: 8, padding: 14, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
          <span>Subtotal</span>
          <span style={{ fontFamily: 'var(--mono)' }}>AED {subtotal.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
          <span>VAT (5%)</span>
          <span style={{ fontFamily: 'var(--mono)' }}>AED {vatAmount.toLocaleString()}</span>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Total</span>
          <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)' }}>AED {total.toLocaleString()}</span>
        </div>
      </div>

      {noProjectCount > 0 && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#fbbf24',
        }}>
          {noProjectCount} driver(s) from the attendance have no project assignment and will NOT be included in the invoice.
        </div>
      )}

      {apiError && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#f87171',
        }}>
          {apiError}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>
        This will create an invoice and mark the attendance batch as invoiced.
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={() => { setApiError(''); generate(); }} disabled={isLoading}>
          {isLoading ? 'Generating...' : 'Generate invoice'}
        </Btn>
      </div>
    </Modal>
  );
};

export default InvoicePreviewModal;
