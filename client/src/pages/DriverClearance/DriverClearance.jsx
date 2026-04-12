import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import { formatDate } from '../../utils/formatters';
import {
  listClearances,
  getClearance,
  logClientClearance,
  logSupplierClearance,
  logInternalClearance,
  addSupplierDeduction,
  removeSupplierDeduction,
} from '../../api/driverClearanceApi';

const statusVariant = {
  pending: 'warning',
  in_progress: 'info',
  completed: 'success',
};

const sectionLabel = {
  clientClearance: 'Client',
  supplierClearance: 'Supplier',
  internalClearance: 'Internal',
};

const sectionPermission = {
  clientClearance: 'clearance.log_client',
  supplierClearance: 'clearance.log_supplier',
  internalClearance: 'clearance.log_internal',
};

const subStatusVariant = (status) => {
  if (status === 'received' || status === 'waived' || status === 'not_applicable') return 'success';
  if (status === 'pending') return 'warning';
  return 'default';
};

const SubStatus = ({ sub }) => {
  if (!sub || !sub.status) return <Badge>—</Badge>;
  const label = sub.status.replace('_', ' ');
  return <Badge variant={subStatusVariant(sub.status)}>{label}</Badge>;
};

const ClearanceSectionCard = ({ clearance, section, onLog }) => {
  const { hasPermission } = useAuth();
  const sub = clearance[section] || {};
  const canEdit = hasPermission(sectionPermission[section]);
  const disabled = section === 'supplierClearance' && !clearance.usesCompanyVehicle;

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: 14,
      background: 'var(--surface2)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{sectionLabel[section]} clearance</div>
        <SubStatus sub={sub} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.7 }}>
        {sub.receivedDate && <div>Received: {formatDate(sub.receivedDate)}</div>}
        {sub.emailRef && <div>Email ref: {sub.emailRef}</div>}
        {sub.remarks && <div>Remarks: {sub.remarks}</div>}
        {sub.loggedBy && (
          <div>Logged by: {typeof sub.loggedBy === 'object' ? sub.loggedBy.name || sub.loggedBy.email : sub.loggedBy} {sub.loggedAt && `· ${formatDate(sub.loggedAt)}`}</div>
        )}
        {disabled && <div style={{ color: 'var(--text3)', fontStyle: 'italic' }}>Not applicable — driver uses own vehicle</div>}
      </div>
      {canEdit && !disabled && (
        <div style={{ marginTop: 10 }}>
          <Btn small onClick={() => onLog(section)}>
            {sub.status && sub.status !== 'pending' ? 'Update' : 'Log clearance'}
          </Btn>
        </div>
      )}
    </div>
  );
};

const LogModal = ({ clearance, section, onClose, onSaved }) => {
  const qc = useQueryClient();
  const current = clearance[section] || {};
  const [status, setStatus] = useState(current.status && current.status !== 'pending' ? current.status : 'received');
  const [receivedDate, setReceivedDate] = useState(
    current.receivedDate ? new Date(current.receivedDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [emailRef, setEmailRef] = useState(current.emailRef || '');
  const [remarks, setRemarks] = useState(current.remarks || '');
  const [attachmentUrl, setAttachmentUrl] = useState(current.attachmentUrl || '');

  const mutationFn = section === 'clientClearance' ? logClientClearance
    : section === 'supplierClearance' ? logSupplierClearance
    : logInternalClearance;

  const mutation = useMutation({
    mutationFn: (payload) => mutationFn(clearance._id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-clearance'] });
      toast.success(`${sectionLabel[section]} clearance logged`);
      onSaved();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to save'),
  });

  const submit = () => {
    mutation.mutate({ status, receivedDate, emailRef, remarks, attachmentUrl });
  };

  return (
    <Modal title={`Log ${sectionLabel[section]} clearance`} onClose={onClose} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            <option value="received">Received</option>
            <option value="waived">Waived</option>
            <option value="pending">Reset to Pending</option>
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} style={inputStyle} />
        </Field>
        <Field label={section === 'internalClearance' ? 'Reference' : 'Email reference'}>
          <input
            type="text"
            value={emailRef}
            onChange={(e) => setEmailRef(e.target.value)}
            placeholder={section === 'internalClearance' ? 'Ticket / ledger ref' : 'Email subject or message-id'}
            style={inputStyle}
          />
        </Field>
        <Field label="Attachment URL (optional)">
          <input type="text" value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder="Link to uploaded PDF" style={inputStyle} />
        </Field>
        <Field label="Remarks">
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
};

const DeductionPanel = ({ clearance }) => {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('clearance.log_supplier');
  const [type, setType] = useState('vehicle_damage');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const addMutation = useMutation({
    mutationFn: () => addSupplierDeduction(clearance._id, { type, amount: parseFloat(amount), description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-clearance'] });
      setAmount('');
      setDescription('');
      toast.success('Deduction added');
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to add'),
  });

  const removeMutation = useMutation({
    mutationFn: (dedId) => removeSupplierDeduction(clearance._id, dedId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-clearance'] });
      toast.success('Deduction removed');
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to remove'),
  });

  if (!clearance.usesCompanyVehicle) return null;

  const deductions = clearance.supplierDeductions || [];

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--surface2)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Supplier deductions</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
        Deductions captured here will be synced into the driver's final salary run when it is processed.
      </div>

      {deductions.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', marginBottom: 10 }}>No deductions added yet.</div>
      )}

      {deductions.map((d) => (
        <div key={d._id} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12,
        }}>
          <div>
            <div style={{ fontWeight: 500 }}>{d.type.replace('_', ' ')}</div>
            {d.description && <div style={{ color: 'var(--text3)', fontSize: 11 }}>{d.description}</div>}
            {d.postedToSalaryRunId && (
              <div style={{ color: 'var(--success, #4ade80)', fontSize: 10, marginTop: 2 }}>
                Posted to salary run
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>AED {Number(d.amount).toLocaleString()}</div>
            {canEdit && !d.postedToSalaryRunId && (
              <Btn small variant="danger" onClick={() => removeMutation.mutate(d._id)}>Remove</Btn>
            )}
          </div>
        </div>
      ))}

      {canEdit && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '130px 110px 1fr auto', gap: 6, alignItems: 'center' }}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
            <option value="vehicle_damage">Vehicle damage</option>
            <option value="fuel">Fuel</option>
            <option value="salik">Salik</option>
            <option value="fine">Fine</option>
            <option value="other">Other</option>
          </select>
          <input
            type="number" step="0.01" min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            style={inputStyle}
          />
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" style={inputStyle} />
          <Btn
            small
            variant="primary"
            onClick={() => addMutation.mutate()}
            disabled={!amount || parseFloat(amount) <= 0 || addMutation.isPending}
          >
            Add
          </Btn>
        </div>
      )}
    </div>
  );
};

const inputStyle = {
  background: 'var(--surface3)',
  border: '1px solid var(--border2)',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  color: 'var(--text)',
  outline: 'none',
  width: '100%',
};

const Field = ({ label, children }) => (
  <div>
    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
    {children}
  </div>
);

const ClearanceDetail = ({ id, onClose }) => {
  const [logSection, setLogSection] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ['driver-clearance', id],
    queryFn: () => getClearance(id).then((r) => r.data),
    enabled: !!id,
  });

  if (isLoading || !data) {
    return (
      <Modal title="Clearance" onClose={onClose} width={640}>
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><LoadingSpinner /></div>
      </Modal>
    );
  }

  return (
    <>
      <Modal title={`Clearance ${data.clearanceNo}`} onClose={onClose} width={720}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
            <InfoRow label="Driver" value={`${data.driverId?.fullName || data.driverName || '—'} (${data.employeeCode || data.driverId?.employeeCode || '—'})`} />
            <InfoRow label="Overall status" value={<Badge variant={statusVariant[data.overallStatus]}>{data.overallStatus.replace('_', ' ')}</Badge>} />
            <InfoRow label="Client" value={data.clientId?.name || '—'} />
            <InfoRow label="Project" value={data.projectId?.name || '—'} />
            <InfoRow label="Supplier" value={data.supplierId?.name || '—'} />
            <InfoRow label="Last working date" value={formatDate(data.lastWorkingDate)} />
            <InfoRow label="Trigger status" value={data.triggerStatus} />
            <InfoRow label="Uses company vehicle" value={data.usesCompanyVehicle ? 'Yes' : 'No'} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {['clientClearance', 'supplierClearance', 'internalClearance'].map((section) => (
              <ClearanceSectionCard
                key={section}
                clearance={data}
                section={section}
                onLog={setLogSection}
              />
            ))}
          </div>

          <DeductionPanel clearance={data} />
        </div>
      </Modal>
      {logSection && (
        <LogModal
          clearance={data}
          section={logSection}
          onClose={() => setLogSection(null)}
          onSaved={() => setLogSection(null)}
        />
      )}
    </>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontSize: 12, marginTop: 2 }}>{value}</div>
  </div>
);

const DriverClearancePage = () => {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['driver-clearance', { statusFilter, page }],
    queryFn: () => listClearances({
      status: statusFilter || undefined,
      page,
      limit: 20,
    }).then((r) => r),
  });

  const items = data?.data || [];
  const total = data?.pagination?.total || 0;

  return (
    <div>
      <PageHeader
        title="Driver clearance"
        subtitle="Track client, supplier, and internal clearances before releasing final salary for resigned/offboarded drivers"
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ ...inputStyle, maxWidth: 200 }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><LoadingSpinner /></div>
      ) : items.length === 0 ? (
        <EmptyState title="No clearance records" message="Clearances are auto-created when a driver transitions to resigned or offboarded." />
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                <th style={thStyle}>Clearance #</th>
                <th style={thStyle}>Driver</th>
                <th style={thStyle}>Client / Project</th>
                <th style={thStyle}>Last working</th>
                <th style={thStyle}>Client</th>
                <th style={thStyle}>Supplier</th>
                <th style={thStyle}>Internal</th>
                <th style={thStyle}>Overall</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row._id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={tdStyle}>{row.clearanceNo}</td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{row.driverId?.fullName || row.driverName || '—'}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 11 }}>{row.employeeCode || row.driverId?.employeeCode}</div>
                  </td>
                  <td style={tdStyle}>
                    {row.clientId?.name || '—'}
                    <div style={{ color: 'var(--text3)', fontSize: 11 }}>{row.projectId?.name || '—'}</div>
                  </td>
                  <td style={tdStyle}>{formatDate(row.lastWorkingDate)}</td>
                  <td style={tdStyle}><SubStatus sub={row.clientClearance} /></td>
                  <td style={tdStyle}><SubStatus sub={row.supplierClearance} /></td>
                  <td style={tdStyle}><SubStatus sub={row.internalClearance} /></td>
                  <td style={tdStyle}><Badge variant={statusVariant[row.overallStatus]}>{row.overallStatus.replace('_', ' ')}</Badge></td>
                  <td style={tdStyle}>
                    <Btn small onClick={() => setSelectedId(row._id)}>Open</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={page}
            total={total}
            pageSize={20}
            totalPages={Math.max(1, Math.ceil(total / 20))}
            onPageChange={setPage}
          />
        </div>
      )}

      {selectedId && (
        <ClearanceDetail id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
};

const thStyle = { padding: '10px 12px', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.05em' };
const tdStyle = { padding: '10px 12px', fontSize: 12, verticalAlign: 'middle' };

export default DriverClearancePage;
