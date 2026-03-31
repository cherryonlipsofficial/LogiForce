import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import SidePanel from '../../components/ui/SidePanel';
import { useAuth } from '../../context/AuthContext';
import PermissionGate from '../../components/ui/PermissionGate';
import { getClients, createClient, updateClient, deleteClient, uploadContract, deleteContract } from '../../api/clientsApi';
import { getProjects } from '../../api/projectsApi';
import { formatDate } from '../../utils/formatters';
import { useFormatters } from '../../hooks/useFormatters';
import Pagination from '../../components/ui/Pagination';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const fallbackClients = [
  { _id: 'CLI-001', name: 'Amazon UAE', contactName: 'Ahmad Hassan', contactEmail: 'ahmad@amazon.ae', contactPhone: '+971 4 123 4567', isActive: true, driverCount: 342, monthlyBilling: 892400, contractStart: '2024-01-01', contractEnd: '2026-12-31', paymentTerms: 'Net 30', vatNo: 'TRN-100234567890003', billingCurrency: 'AED' },
  { _id: 'CLI-002', name: 'Noon', contactName: 'Fatima Al Zahra', contactEmail: 'fatima@noon.com', contactPhone: '+971 4 234 5678', isActive: true, driverCount: 218, monthlyBilling: 558700, contractStart: '2024-06-01', contractEnd: '2026-05-31', paymentTerms: 'Net 30', vatNo: 'TRN-100345678901234', billingCurrency: 'AED' },
  { _id: 'CLI-003', name: 'Talabat', contactName: 'Khalid Mustafa', contactEmail: 'khalid@talabat.com', contactPhone: '+971 4 345 6789', isActive: true, driverCount: 156, monthlyBilling: 389200, contractStart: '2025-01-01', contractEnd: '2027-12-31', paymentTerms: 'Net 45', vatNo: 'TRN-100456789012345', billingCurrency: 'AED' },
  { _id: 'CLI-004', name: 'Careem', contactName: 'Layla Ibrahim', contactEmail: 'layla@careem.com', contactPhone: '+971 4 456 7890', isActive: false, driverCount: 0, monthlyBilling: 0, contractStart: '2023-01-01', contractEnd: '2025-12-31', paymentTerms: 'Net 30', vatNo: 'TRN-100567890123456', billingCurrency: 'AED' },
];

const isClientActive = (c) => c.isActive !== undefined ? c.isActive : c.status === 'active';

const toDateInput = (val) => {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

// Legacy canEdit removed — using PermissionGate / hasPermission instead

const Clients = () => {
  const { isMobile, isTablet } = useBreakpoint();
  const { formatCurrencyFull } = useFormatters();
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);
  const [page, setPage] = useState(1);
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['clients', { search, page }],
    queryFn: () => getClients({ search: search || undefined, page, limit: 20 }),
    retry: 1,
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects', { limit: 1 }],
    queryFn: () => getProjects({ limit: 1 }),
    retry: 1,
  });

  const { mutate: doDelete } = useMutation({
    mutationFn: (id) => deleteClient(id),
    onSuccess: () => {
      toast.success('Client deleted');
      qc.invalidateQueries(['clients']);
      setSelectedClientId(null);
    },
    onError: () => toast.error('Failed to delete client'),
  });

  const clients = data?.data || fallbackClients;
  const pagination = data?.pagination;
  const filtered = clients;

  const totalProjects = projectsData?.pagination?.total ?? 0;
  const totalBilling = clients.reduce((s, c) => s + (c.monthlyBilling || 0), 0);
  const activeCount = clients.filter((c) => isClientActive(c)).length;

  // Derive selected/editing client from fresh query data
  const selectedClient = selectedClientId ? clients.find((c) => c._id === selectedClientId) || null : null;
  const editingClient = editingClientId ? clients.find((c) => c._id === editingClientId) || null : null;

  const handleEdit = (client) => {
    setSelectedClientId(null);
    setEditingClientId(client._id);
  };

  const handleDelete = (client) => {
    if (window.confirm(`Are you sure you want to delete "${client.name}"? This action cannot be undone.`)) {
      doDelete(client._id);
    }
  };

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total clients" value={clients.length} />
        <KpiCard label="Active" value={activeCount} color="#4ade80" />
        <KpiCard label="Total projects" value={totalProjects} />
        <KpiCard label="Monthly billing" value={formatCurrencyFull(totalBilling)} color="#7eb3fc" />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search clients..." style={{ width: isMobile ? '100%' : 260, height: 34 }} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <PermissionGate permission="clients.create">
              <Btn small variant="primary" onClick={() => setShowAddModal(true)}>+ Add client</Btn>
            </PermissionGate>
          </div>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No clients found" message="Add a client to get started." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {['Client', 'Contact', 'Trade Licence No.', 'TRN No.', 'Payment terms', 'Contract end', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', background: 'var(--surface2)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const active = isClientActive(c);
                  return (
                    <tr
                      key={c._id}
                      onClick={() => setSelectedClientId(c._id)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontSize: 12 }}>{c.contactName}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>{c.contactEmail}</div>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)' }}>
                        {c.tradeLicenceNo || '—'}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)' }}>
                        {c.vatNo || '—'}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)' }}>{c.paymentTerms}</td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--text3)' }}>{formatDate(c.contractEnd)}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <Badge variant={active ? 'success' : 'default'}>{active ? 'Active' : 'Inactive'}</Badge>
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
          total={pagination?.total ?? clients.length}
          pageSize={pagination?.limit || 20}
          onPageChange={setPage}
        />
      </div>

      {selectedClient && <ClientDetail client={selectedClient} onClose={() => setSelectedClientId(null)} onEdit={handleEdit} onDelete={handleDelete} hasPermission={hasPermission} />}
      {showAddModal && <ClientFormModal onClose={() => setShowAddModal(false)} />}
      {editingClient && <ClientFormModal client={editingClient} onClose={() => setEditingClientId(null)} />}
    </div>
  );
};

const ClientDetail = ({ client, onClose, onEdit, onDelete, hasPermission }) => {
  const { isMobile } = useBreakpoint();
  const active = isClientActive(client);
  const qc = useQueryClient();

  const updateClientInCache = (updatedClient) => {
    qc.setQueryData(['clients'], (old) => {
      if (!old?.data) return old;
      return { ...old, data: old.data.map((c) => (c._id === updatedClient._id ? { ...c, ...updatedClient } : c)) };
    });
  };

  const { mutate: doUpload, isPending: uploading } = useMutation({
    mutationFn: (file) => uploadContract(client._id, file),
    onSuccess: (res) => {
      toast.success('Contract uploaded');
      if (res?.data) updateClientInCache(res.data);
      else qc.invalidateQueries(['clients']);
    },
    onError: () => toast.error('Failed to upload contract'),
  });

  const { mutate: doDeleteContract } = useMutation({
    mutationFn: () => deleteContract(client._id),
    onSuccess: (res) => {
      toast.success('Contract removed');
      if (res?.data) updateClientInCache(res.data);
      else qc.invalidateQueries(['clients']);
    },
    onError: () => toast.error('Failed to remove contract'),
  });

  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are allowed');
      return;
    }
    doUpload(file);
    e.target.value = '';
  };

  const handleViewContract = () => {
    const token = localStorage.getItem('token');
    const base = import.meta.env.VITE_API_URL || 'https://logiforce.onrender.com/api';
    const url = `${base}/clients/${client._id}/contract`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      })
      .catch(() => toast.error('Failed to load contract'));
  };

  const handleDownloadContract = () => {
    const token = localStorage.getItem('token');
    const base = import.meta.env.VITE_API_URL || 'https://logiforce.onrender.com/api';
    const url = `${base}/clients/${client._id}/contract?download=true`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = client.contractFile?.originalName || 'contract.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => toast.error('Failed to download contract'));
  };

  const handleRemoveContract = () => {
    if (window.confirm('Remove the contract file? This cannot be undone.')) {
      doDeleteContract();
    }
  };

  return (
    <SidePanel onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{client.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            <Badge variant={active ? 'success' : 'default'}>{active ? 'Active' : 'Inactive'}</Badge>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasPermission('clients.edit') && <Btn small variant="ghost" onClick={() => onEdit(client)}>Edit</Btn>}
          {hasPermission('clients.delete') && <Btn small variant="ghost" onClick={() => onDelete(client)} style={{ color: '#f87171' }}>Delete</Btn>}
          <button onClick={onClose} style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 16 }}>&times;</button>
        </div>
      </div>
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <InfoRow label="Contact person" value={client.contactName} />
          <InfoRow label="Email" value={client.contactEmail} />
          <InfoRow label="Phone" value={client.contactPhone} />
          <InfoRow label="VAT / TRN" value={client.vatNo} />
          <InfoRow label="Trade licence no." value={client.tradeLicenceNo} />
          <InfoRow label="Billing currency" value={client.billingCurrency || 'AED'} />
          <InfoRow label="Payment terms" value={client.paymentTerms} />
          <InfoRow label="Contract start" value={formatDate(client.contractStart)} />
          <InfoRow label="Contract end" value={formatDate(client.contractEnd)} />
          <InfoRow label="Driver count" value={client.driverCount} />
        </div>

        {/* Contract file section */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Contract document</div>
          {client.contractFile?.originalName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#f87171', flexShrink: 0 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.contractFile.originalName}</div>
                {client.contractFile.uploadedAt && <div style={{ fontSize: 10, color: 'var(--text3)' }}>Uploaded {formatDate(client.contractFile.uploadedAt)}</div>}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <Btn small variant="ghost" onClick={handleViewContract}>View</Btn>
                <Btn small variant="ghost" onClick={handleDownloadContract}>Download</Btn>
                {hasPermission('clients.edit') && <Btn small variant="ghost" onClick={handleRemoveContract} style={{ color: '#f87171' }}>Remove</Btn>}
              </div>
            </div>
          ) : (
            <div style={{ padding: '14px', background: 'var(--surface2)', borderRadius: 8, border: '1px dashed var(--border2)', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>No contract uploaded</div>
              {hasPermission('clients.edit') && (
                <>
                  <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileSelect} style={{ display: 'none' }} />
                  <Btn small variant="primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? 'Uploading...' : 'Upload contract PDF'}
                  </Btn>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </SidePanel>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value || '—'}</div>
  </div>
);

const ClientFormModal = ({ client, onClose }) => {
  const { isMobile } = useBreakpoint();
  const isEdit = !!client;
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: isEdit ? {
      name: client.name || '',
      contactName: client.contactName || '',
      contactEmail: client.contactEmail || '',
      contactPhone: client.contactPhone || '',
      paymentTerms: client.paymentTerms || 'Net 30',
      vatNo: client.vatNo || '',
      tradeLicenceNo: client.tradeLicenceNo || '',
      billingCurrency: client.billingCurrency || 'AED',
      contractStart: toDateInput(client.contractStart),
      contractEnd: toDateInput(client.contractEnd),
      isActive: client.isActive !== undefined ? String(client.isActive) : 'true',
    } : {
      paymentTerms: 'Net 30',
      billingCurrency: 'AED',
      isActive: 'true',
    },
  });
  const qc = useQueryClient();

  const { mutate: save, isPending: isLoading } = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        isActive: data.isActive === true || data.isActive === 'true',
        contractStart: data.contractStart || null,
        contractEnd: data.contractEnd || null,
      };
      return isEdit ? updateClient(client._id, payload) : createClient(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Client updated' : 'Client created');
      qc.invalidateQueries(['clients']);
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.message || (isEdit ? 'Failed to update client' : 'Failed to create client')),
  });

  const fieldStyle = { marginBottom: 14 };
  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title={isEdit ? 'Edit client' : 'Add new client'} onClose={onClose} width={520}>
      <form onSubmit={handleSubmit((data) => save(data))}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Company name *</label>
            <input {...register('name', { required: true })} placeholder="Acme Logistics" />
            {errors.name && <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Contact person</label>
            <input {...register('contactName')} placeholder="John Doe" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Email</label>
            <input type="email" {...register('contactEmail')} placeholder="contact@company.com" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Phone</label>
            <input {...register('contactPhone', { validate: (v) => !v || !/\s/.test(v) || 'Phone number must not contain spaces' })} placeholder="+97141234567" onKeyDown={(e) => { if (e.key === ' ') e.preventDefault(); }} onPaste={(e) => { const pasted = e.clipboardData.getData('text'); if (/\s/.test(pasted)) { e.preventDefault(); const cleaned = pasted.replace(/\s/g, ''); document.execCommand('insertText', false, cleaned); } }} />
            {errors.contactPhone && <span style={{ color: '#f87171', fontSize: 11 }}>{errors.contactPhone.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Billing currency</label>
            <select {...register('billingCurrency')}>
              <option value="AED">AED</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Payment terms</label>
            <select {...register('paymentTerms')}>
              <option value="Net 30">Net 30</option>
              <option value="Net 45">Net 45</option>
              <option value="Net 60">Net 60</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>VAT / TRN</label>
            <input {...register('vatNo')} placeholder="TRN-XXXXXXXXXX" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Trade licence no.</label>
            <input {...register('tradeLicenceNo')} placeholder="TL-2024-XXX-001" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Contract start</label>
            <input type="date" {...register('contractStart')} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Contract end</label>
            <input type="date" {...register('contractEnd')} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Status</label>
            <select {...register('isActive')}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose} disabled={isLoading}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isLoading}>{isLoading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save changes' : 'Create client')}</Btn>
        </div>
      </form>
    </Modal>
  );
};

export default Clients;
