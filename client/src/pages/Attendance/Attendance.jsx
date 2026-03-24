import { useState, useRef } from 'react';
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
import { getBatches, uploadFile, getBatch, approveBatch } from '../../api/attendanceApi';
import { formatDate } from '../../utils/formatters';

const fallbackBatches = [
  { _id: 'ATT-001', client: 'Amazon UAE', period: 'Mar 2026', uploadedBy: 'Sara Ali', uploadedAt: '2026-03-20T10:30:00Z', status: 'pending_review', totalRecords: 342, validRecords: 338, errors: 4, fileName: 'amazon_mar2026.csv' },
  { _id: 'ATT-002', client: 'Noon', period: 'Mar 2026', uploadedBy: 'Sara Ali', uploadedAt: '2026-03-19T14:15:00Z', status: 'approved', totalRecords: 218, validRecords: 218, errors: 0, fileName: 'noon_mar2026.xlsx' },
  { _id: 'ATT-003', client: 'Talabat', period: 'Mar 2026', uploadedBy: 'Omar K.', uploadedAt: '2026-03-18T09:00:00Z', status: 'approved', totalRecords: 156, validRecords: 154, errors: 2, fileName: 'talabat_mar2026.csv' },
  { _id: 'ATT-004', client: 'Amazon UAE', period: 'Feb 2026', uploadedBy: 'Sara Ali', uploadedAt: '2026-02-20T11:00:00Z', status: 'approved', totalRecords: 340, validRecords: 340, errors: 0, fileName: 'amazon_feb2026.csv' },
  { _id: 'ATT-005', client: 'Noon', period: 'Feb 2026', uploadedBy: 'Omar K.', uploadedAt: '2026-02-19T08:45:00Z', status: 'approved', totalRecords: 215, validRecords: 212, errors: 3, fileName: 'noon_feb2026.xlsx' },
];

const statusMap = {
  pending_review: { label: 'Pending review', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  processing: { label: 'Processing', variant: 'info' },
};

const Attendance = () => {
  const [showUpload, setShowUpload] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [clientFilter, setClientFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-batches'],
    queryFn: () => getBatches(),
    retry: 1,
  });

  const batches = data?.data || fallbackBatches;

  const filtered = clientFilter === 'all' ? batches : batches.filter((b) => b.client === clientFilter);

  const totalRecords = batches.reduce((s, b) => s + (b.totalRecords || 0), 0);
  const totalErrors = batches.reduce((s, b) => s + (b.errors || 0), 0);
  const pendingCount = batches.filter((b) => b.status === 'pending_review').length;

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total batches" value={batches.length} />
        <KpiCard label="Total records" value={totalRecords.toLocaleString()} />
        <KpiCard label="Pending review" value={pendingCount} color="#fbbf24" />
        <KpiCard label="Validation errors" value={totalErrors} color={totalErrors > 0 ? '#f87171' : '#4ade80'} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={{ width: 180, height: 34 }}>
            <option value="all">All clients</option>
            <option value="Amazon UAE">Amazon UAE</option>
            <option value="Noon">Noon</option>
            <option value="Talabat">Talabat</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Btn small variant="primary" onClick={() => setShowUpload(true)}>Upload attendance</Btn>
          </div>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No batches" message="Upload an attendance file to get started." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {['Batch', 'Client', 'Period', 'File', 'Records', 'Errors', 'Status', 'Uploaded'].map((h) => (
                    <th key={h} style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', background: 'var(--surface2)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const st = statusMap[b.status] || statusMap.pending_review;
                  return (
                    <tr
                      key={b._id}
                      onClick={() => setSelectedBatch(b)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{b._id}</span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{b.client}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>{b.period}</td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--text3)' }}>{b.fileName}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{b.totalRecords}</span>
                        <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>({b.validRecords} valid)</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        {b.errors > 0 ? (
                          <Badge variant="danger">{b.errors}</Badge>
                        ) : (
                          <span style={{ color: '#4ade80', fontSize: 12 }}>0</span>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--text3)' }}>
                        {formatDate(b.uploadedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
          Showing {filtered.length} of {batches.length} batches
        </div>
      </div>

      {selectedBatch && <BatchDetail batch={selectedBatch} onClose={() => setSelectedBatch(null)} />}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  );
};

const BatchDetail = ({ batch, onClose }) => {
  const qc = useQueryClient();

  const { mutate: approve, isLoading: approving } = useMutation({
    mutationFn: () => approveBatch(batch._id),
    onSuccess: () => {
      toast.success('Batch approved');
      qc.invalidateQueries(['attendance-batches']);
      onClose();
    },
    onError: () => toast.error('Failed to approve batch'),
  });

  const st = statusMap[batch.status] || statusMap.pending_review;

  return (
    <SidePanel onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Batch {batch._id}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{batch.client} &middot; {batch.period}</div>
        </div>
        <button onClick={onClose} style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 16 }}>&times;</button>
      </div>
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <InfoRow label="File" value={batch.fileName} />
          <InfoRow label="Status" value={<Badge variant={st.variant}>{st.label}</Badge>} />
          <InfoRow label="Total records" value={batch.totalRecords} />
          <InfoRow label="Valid records" value={batch.validRecords} />
          <InfoRow label="Errors" value={batch.errors} />
          <InfoRow label="Uploaded by" value={batch.uploadedBy} />
          <InfoRow label="Upload date" value={formatDate(batch.uploadedAt)} />
        </div>

        {batch.errors > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Validation errors</div>
            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: 14, fontSize: 12, color: '#f87171' }}>
              {batch.errors} record(s) have validation issues. Review the uploaded file and re-upload if needed.
            </div>
          </div>
        )}

        {batch.status === 'pending_review' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="primary" onClick={() => approve()} disabled={approving}>
              {approving ? 'Approving...' : 'Approve batch'}
            </Btn>
            <Btn variant="danger" onClick={onClose}>Reject</Btn>
          </div>
        )}
      </div>
    </SidePanel>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div>
  </div>
);

const TEMPLATE_COLUMNS = ['employee_code', 'driver_name', 'working_days', 'overtime_hours'];
const TEMPLATE_SAMPLE_ROWS = [
  ['EMP001', 'Ahmed Khan', '22', '5'],
  ['EMP002', 'Sara Ali', '20', '0'],
  ['EMP003', 'Omar Hassan', '25', '8'],
];

const downloadTemplate = () => {
  const header = TEMPLATE_COLUMNS.join(',');
  const rows = TEMPLATE_SAMPLE_ROWS.map((r) => r.join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'attendance_template.csv';
  a.click();
  URL.revokeObjectURL(url);
};

const UploadModal = ({ onClose }) => {
  const fileRef = useRef(null);
  const [clientId, setClientId] = useState('');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [file, setFile] = useState(null);
  const qc = useQueryClient();

  const { mutate: upload, isLoading } = useMutation({
    mutationFn: (formData) => uploadFile(formData),
    onSuccess: () => {
      toast.success('Attendance uploaded successfully');
      qc.invalidateQueries(['attendance-batches']);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Upload failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file || !clientId) {
      toast.error('Please select a client and file');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('clientId', clientId);
    fd.append('year', year);
    fd.append('month', month);
    fd.append('columnMapping', JSON.stringify({ employeeCode: 'employee_code', workingDays: 'working_days', overtimeHours: 'overtime_hours' }));
    upload(fd);
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };
  const thStyle = { padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textAlign: 'left', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' };
  const tdStyle = { padding: '5px 10px', fontSize: 11, color: 'var(--text3)', borderBottom: '1px solid var(--border)' };

  return (
    <Modal title="Upload attendance" onClose={onClose} width={520}>
      <form onSubmit={handleSubmit}>
        {/* Template format section */}
        <div style={{ marginBottom: 16, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Required format</div>
            <button
              type="button"
              onClick={downloadTemplate}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border2)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                color: 'var(--accent)',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Download template
            </button>
          </div>
          <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {TEMPLATE_COLUMNS.map((col) => (
                    <th key={col} style={thStyle}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TEMPLATE_SAMPLE_ROWS.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} style={tdStyle}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
            <strong>employee_code</strong> &mdash; required, must match a driver in the system<br />
            <strong>driver_name</strong> &mdash; optional, for reference only<br />
            <strong>working_days</strong> &mdash; required, number between 0&ndash;31<br />
            <strong>overtime_hours</strong> &mdash; optional, defaults to 0
          </div>
        </div>

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
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Attendance file (CSV / Excel) *</label>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: '2px dashed var(--border2)',
              borderRadius: 8,
              padding: '24px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              color: 'var(--text3)',
              fontSize: 13,
            }}
          >
            {file ? file.name : 'Click to select file or drag & drop'}
          </div>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} style={{ display: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isLoading}>
            {isLoading ? 'Uploading...' : 'Upload'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default Attendance;
