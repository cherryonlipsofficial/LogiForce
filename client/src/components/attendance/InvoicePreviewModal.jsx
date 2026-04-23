import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import { generateInvoice, getInvoicePreview } from '../../api/attendanceApi';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useFormatters } from '../../hooks/useFormatters';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const RATE_BASIS_LABEL = {
  monthly_fixed: '/month',
  daily_rate: '/day',
  per_order: '/order',
};

const InvoicePreviewModal = ({ batch, onClose, onSuccess }) => {
  const { isMobile } = useBreakpoint();
  const { n } = useFormatters();
  const [apiError, setApiError] = useState('');
  const qc = useQueryClient();

  const { data: preview, isLoading: loadingPreview, error: previewError } = useQuery({
    queryKey: ['invoice-preview', batch._id],
    queryFn: () => getInvoicePreview(batch._id).then(r => r.data),
    enabled: !!batch._id,
  });

  const { mutate: generate, isPending: isGenerating } = useMutation({
    mutationFn: () => generateInvoice(batch._id),
    onSuccess: (res) => {
      const inv = res?.data?.invoice || res?.data || res;
      const total = res?.data?.summary?.total ?? inv?.total ?? 0;
      toast.success(`Invoice ${inv?.invoiceNo || ''} generated — AED ${n(Number(total).toLocaleString())}`);
      qc.invalidateQueries(['attendance-batches']);
      qc.invalidateQueries(['invoices']);
      onSuccess?.();
      onClose();
    },
    onError: (err) => setApiError(err.response?.data?.message || 'Failed to generate invoice'),
  });

  const monthName = preview?.period?.month
    ? MONTHS[(preview.period.month || 1) - 1]
    : (batch.period?.month ? MONTHS[(batch.period.month || 1) - 1] : (typeof batch.period === 'string' ? batch.period.split(' ')[0] : ''));
  const year = preview?.period?.year
    || batch.period?.year
    || (typeof batch.period === 'string' ? batch.period.split(' ')[1] : '');
  const clientName = preview?.client?.name || batch.clientId?.name || batch.client || 'Unknown';
  const projectName = preview?.project?.name || batch.projectId?.name || batch.project || 'N/A';
  const projectCode = preview?.project?.projectCode || batch.projectId?.projectCode || batch.projectCode || '';

  const subtotal = preview?.subtotal || 0;
  const vatAmount = preview?.vatAmount || 0;
  const total = preview?.total || 0;
  const lineItems = preview?.lineItems || [];
  const ratePerDriver = preview?.ratePerDriver || 0;
  const rateBasis = preview?.rateBasis || 'monthly_fixed';
  const rateSuffix = RATE_BASIS_LABEL[rateBasis] || '';
  const rateConfigured = preview ? preview.rateConfigured : true;

  const thStyle = { padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textAlign: 'left', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' };
  const tdStyle = { padding: '7px 12px', fontSize: 12, borderBottom: '1px solid var(--border)' };

  const canGenerate = !loadingPreview && !previewError && rateConfigured && lineItems.length > 0;

  return (
    <Modal title="Generate invoice — preview" onClose={onClose} width={640}>
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
            {projectName}
            {projectCode && (
              <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>{projectCode}</span>
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

      {loadingPreview ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>
          Calculating preview…
        </div>
      ) : previewError ? (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#f87171',
        }}>
          {previewError.response?.data?.message || 'Failed to load invoice preview'}
        </div>
      ) : !rateConfigured ? (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#f87171',
        }}>
          Project "{projectName}" has no rate configured. Set a rate per driver on the project before generating an invoice.
        </div>
      ) : lineItems.length === 0 ? (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#fbbf24',
        }}>
          No billable attendance records were found for this batch.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Driver</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>
                  {rateBasis === 'per_order' ? 'Orders' : 'Days'}
                </th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Rate</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) => (
                <tr key={li.driverId}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{li.driverName || '—'}</div>
                    {li.employeeCode && (
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{li.employeeCode}</div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {rateBasis === 'per_order' ? li.totalOrders : li.workingDays}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    AED {n(Number(ratePerDriver).toLocaleString())}{rateSuffix}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    AED {n(Number(li.amount).toLocaleString())}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{
        background: 'var(--surface2)', borderRadius: 8, padding: 14, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
          <span>Subtotal</span>
          <span style={{ fontFamily: 'var(--mono)' }}>AED {n(Number(subtotal).toLocaleString())}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
          <span>VAT (5%)</span>
          <span style={{ fontFamily: 'var(--mono)' }}>AED {n(Number(vatAmount).toLocaleString())}</span>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Total</span>
          <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)' }}>AED {n(Number(total).toLocaleString())}</span>
        </div>
      </div>

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
        <Btn
          variant="primary"
          onClick={() => { setApiError(''); generate(); }}
          disabled={isGenerating || !canGenerate}
        >
          {isGenerating ? 'Generating...' : 'Generate invoice'}
        </Btn>
      </div>
    </Modal>
  );
};

export default InvoicePreviewModal;
