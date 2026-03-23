import { useState } from 'react';
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
import { getClients, createClient, updateClient } from '../../api/clientsApi';
import { formatDate, formatCurrencyFull } from '../../utils/formatters';

const fallbackClients = [
  { _id: 'CLI-001', name: 'Amazon UAE', contactPerson: 'Ahmad Hassan', email: 'ahmad@amazon.ae', phone: '+971 4 123 4567', status: 'active', driverCount: 342, monthlyBilling: 892400, contractStart: '2024-01-01', contractEnd: '2026-12-31', paymentTerms: 'Net 30', trn: 'TRN-100234567890003' },
  { _id: 'CLI-002', name: 'Noon', contactPerson: 'Fatima Al Zahra', email: 'fatima@noon.com', phone: '+971 4 234 5678', status: 'active', driverCount: 218, monthlyBilling: 558700, contractStart: '2024-06-01', contractEnd: '2026-05-31', paymentTerms: 'Net 30', trn: 'TRN-100345678901234' },
  { _id: 'CLI-003', name: 'Talabat', contactPerson: 'Khalid Mustafa', email: 'khalid@talabat.com', phone: '+971 4 345 6789', status: 'active', driverCount: 156, monthlyBilling: 389200, contractStart: '2025-01-01', contractEnd: '2027-12-31', paymentTerms: 'Net 45', trn: 'TRN-100456789012345' },
  { _id: 'CLI-004', name: 'Careem', contactPerson: 'Layla Ibrahim', email: 'layla@careem.com', phone: '+971 4 456 7890', status: 'inactive', driverCount: 0, monthlyBilling: 0, contractStart: '2023-01-01', contractEnd: '2025-12-31', paymentTerms: 'Net 30', trn: 'TRN-100567890123456' },
];

const Clients = () => {
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients(),
    retry: 1,
  });

  const clients = data?.data || fallbackClients;
  const filtered = clients.filter((c) => c.name?.toLowerCase().includes(search.toLowerCase()) || c.contactPerson?.toLowerCase().includes(search.toLowerCase()));

  const totalDrivers = clients.reduce((s, c) => s + (c.driverCount || 0), 0);
  const totalBilling = clients.reduce((s, c) => s + (c.monthlyBilling || 0), 0);
  const activeCount = clients.filter((c) => c.status === 'active').length;

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total clients" value={clients.length} />
        <KpiCard label="Active" value={activeCount} color="#4ade80" />
        <KpiCard label="Total drivers" value={totalDrivers.toLocaleString()} />
        <KpiCard label="Monthly billing" value={formatCurrencyFull(totalBilling)} color="#7eb3fc" />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients..." style={{ width: 260, height: 34 }} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Btn small variant="primary" onClick={() => setShowAddModal(true)}>+ Add client</Btn>
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
                  {['Client', 'Contact', 'Drivers', 'Monthly billing', 'Payment terms', 'Contract end', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', background: 'var(--surface2)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c._id}
                    onClick={() => setSelectedClient(c)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontSize: 12 }}>{c.contactPerson}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{c.email}</div>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{c.driverCount}</span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{formatCurrencyFull(c.monthlyBilling)}</span>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)' }}>{c.paymentTerms}</td>
                    <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--text3)' }}>{formatDate(c.contractEnd)}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <Badge variant={c.status === 'active' ? 'success' : 'default'}>{c.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
          Showing {filtered.length} of {clients.length} clients
        </div>
      </div>

      {selectedClient && <ClientDetail client={selectedClient} onClose={() => setSelectedClient(null)} />}
      {showAddModal && <AddClientModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
};

const ClientDetail = ({ client, onClose }) => {
  return (
    <SidePanel onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{client.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            <Badge variant={client.status === 'active' ? 'success' : 'default'}>{client.status === 'active' ? 'Active' : 'Inactive'}</Badge>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 16 }}>&times;</button>
      </div>
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <InfoRow label="Contact person" value={client.contactPerson} />
          <InfoRow label="Email" value={client.email} />
          <InfoRow label="Phone" value={client.phone} />
          <InfoRow label="TRN" value={client.trn} />
          <InfoRow label="Payment terms" value={client.paymentTerms} />
          <InfoRow label="Driver count" value={client.driverCount} />
          <InfoRow label="Monthly billing" value={formatCurrencyFull(client.monthlyBilling)} />
          <InfoRow label="Contract start" value={formatDate(client.contractStart)} />
          <InfoRow label="Contract end" value={formatDate(client.contractEnd)} />
        </div>
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

const AddClientModal = ({ onClose }) => {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const qc = useQueryClient();

  const { mutate: create, isLoading } = useMutation({
    mutationFn: (data) => createClient(data),
    onSuccess: () => {
      toast.success('Client created');
      qc.invalidateQueries(['clients']);
      onClose();
    },
    onError: () => toast.error('Failed to create client'),
  });

  const fieldStyle = { marginBottom: 14 };
  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title="Add new client" onClose={onClose} width={520}>
      <form onSubmit={handleSubmit((data) => create(data))}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Company name *</label>
            <input {...register('name', { required: true })} placeholder="Acme Logistics" />
            {errors.name && <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Contact person *</label>
            <input {...register('contactPerson', { required: true })} placeholder="John Doe" />
            {errors.contactPerson && <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Email</label>
            <input type="email" {...register('email')} placeholder="contact@company.com" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Phone</label>
            <input {...register('phone')} placeholder="+971 4 123 4567" />
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
            <label style={labelStyle}>TRN</label>
            <input {...register('trn')} placeholder="TRN-XXXXXXXXXX" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isLoading}>{isLoading ? 'Creating...' : 'Create client'}</Btn>
        </div>
      </form>
    </Modal>
  );
};

export default Clients;
