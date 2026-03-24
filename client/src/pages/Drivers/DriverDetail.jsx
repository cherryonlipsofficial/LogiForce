import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import SidePanel from '../../components/ui/SidePanel';
import Avatar from '../../components/ui/Avatar';
import StatusBadge from '../../components/ui/StatusBadge';
import Badge from '../../components/ui/Badge';
import SectionHeader from '../../components/ui/SectionHeader';
import Btn from '../../components/ui/Btn';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useNavigate } from 'react-router-dom';
import { getDriverLedger, updateDriver, changeDriverStatus, getDriverDocuments, uploadDriverDocument, fetchDocumentFile, getDocumentDirectUrl } from '../../api/driversApi';
import { getClients } from '../../api/clientsApi';

const DOC_TYPES = [
  { value: 'emirates_id', label: 'Emirates ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'visa', label: 'UAE Residence Visa' },
  { value: 'labour_card', label: 'Labour Card' },
  { value: 'driving_licence', label: 'UAE Driving Licence' },
  { value: 'mulkiya', label: 'Mulkiya (Vehicle Reg.)' },
];

const tabs = ['profile', 'financial', 'documents', 'history'];

const formatDate = (val) => {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getExpiryStatus = (dateVal) => {
  if (!dateVal) return 'default';
  const now = new Date();
  const exp = new Date(dateVal);
  if (exp < now) return 'danger';
  const sixtyDays = new Date();
  sixtyDays.setDate(sixtyDays.getDate() + 60);
  if (exp < sixtyDays) return 'warning';
  return 'success';
};

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const DriverDetail = ({ driver, onClose }) => {
  const [tab, setTab] = useState('profile');
  const [showEdit, setShowEdit] = useState(false);
  const [showStatusChange, setShowStatusChange] = useState(false);
  const [viewingFile, setViewingFile] = useState(null); // { blobUrl, contentType, fileName }

  const handleViewFile = async (fileKey, fileUrl) => {
    try {
      if (fileUrl) {
        // Use Cloudinary URL directly — persistent and doesn't expire
        const isPdf = fileUrl.toLowerCase().includes('.pdf') || fileKey.toLowerCase().includes('.pdf');
        setViewingFile({ blobUrl: fileUrl, contentType: isPdf ? 'application/pdf' : 'image', fileName: fileKey, isDirect: true });
      } else {
        // Fallback for legacy documents stored on local filesystem
        const res = await fetchDocumentFile(fileKey);
        const blobUrl = URL.createObjectURL(res.data);
        const contentType = res.data.type || '';
        setViewingFile({ blobUrl, contentType, fileName: fileKey, isDirect: false });
      }
    } catch {
      toast.error('Failed to load document');
    }
  };

  const handleDownloadFile = () => {
    if (!viewingFile) return;
    const a = document.createElement('a');
    a.href = viewingFile.blobUrl;
    a.download = viewingFile.fileName;
    a.click();
  };
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const d = driver;
  const driverId = d._id || d.id;
  const driverName = d.fullName || d.name || '';
  const driverClient = d.clientId?.name || d.client || '';
  const driverSupplier = d.supplierId?.name || d.supplier || '';
  const initials = driverName
    ? driverName.split(' ').map((n) => n[0]).join('').toUpperCase()
    : '??';

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['driverLedger', driverId],
    queryFn: () => getDriverLedger(driverId),
    enabled: tab === 'financial',
  });

  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ['driverDocuments', driverId],
    queryFn: () => getDriverDocuments(driverId),
    enabled: tab === 'documents',
  });

  const ledger = ledgerData?.data || [];

  const history = [
    { date: d.joinDate || '03 Mar 2023', event: `Joined — ${driverClient || 'Unknown'}`, detail: `Status: Active · Base: AED ${(d.baseSalary || 0).toLocaleString()}/mo` },
  ];

  const grossSalary = d.grossSalary || d.baseSalary || 0;
  const deductionsAmt = d.deductions || 0;
  const netSalary = d.netSalary || grossSalary - deductionsAmt;
  const workingDays = d.workingDays ?? 0;
  const advanceBalance = d.advanceBalance || 0;

  // Build documents list from real data + driver fields
  const uploadedDocs = docsData?.data || [];
  const docMap = {};
  uploadedDocs.forEach((doc) => { docMap[doc.docType] = doc; });

  // Merge model fields with uploaded docs for display
  const documentsList = DOC_TYPES.map((dt) => {
    const uploaded = docMap[dt.value];
    let expiry = null;
    if (dt.value === 'emirates_id') expiry = d.emiratesIdExpiry || uploaded?.expiryDate;
    if (dt.value === 'passport') expiry = d.passportExpiry || uploaded?.expiryDate;
    if (dt.value === 'visa') expiry = d.visaExpiry || uploaded?.expiryDate;
    if (dt.value === 'labour_card') expiry = d.labourCardExpiry || uploaded?.expiryDate;
    if (dt.value === 'driving_licence') expiry = d.drivingLicenceExpiry || uploaded?.expiryDate;
    if (dt.value === 'mulkiya') expiry = d.mulkiyaExpiry || uploaded?.expiryDate;
    return {
      ...dt,
      expiry,
      fileKey: uploaded?.fileKey || null,
      fileUrl: uploaded?.fileUrl || null,
      uploadStatus: uploaded?.status || null,
      hasFile: !!uploaded?.fileKey,
    };
  });

  return (
    <SidePanel onClose={onClose} width={480}>
      {/* Header */}
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Avatar initials={initials} size={44} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{driverName}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {d.employeeCode || d.id} · {driverClient}
            </div>
          </div>
          <StatusBadge status={d.status || 'active'} />
          <button
            onClick={onClose}
            style={{
              background: 'var(--surface3)',
              border: '1px solid var(--border2)',
              color: 'var(--text2)',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            &times;
          </button>
        </div>
        <div
          style={{
            background: 'linear-gradient(135deg,rgba(29,179,136,0.1),rgba(79,142,247,0.08))',
            border: '1px solid rgba(29,179,136,0.2)',
            borderRadius: 10,
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              March 2026 net pay
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#4ade80', letterSpacing: '-0.5px' }}>
              AED {netSalary.toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Working days</div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>{workingDays}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 14px',
              fontSize: 12,
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text3)',
              fontWeight: tab === t ? 500 : 400,
              cursor: 'pointer',
              transition: 'all .15s',
              textTransform: 'capitalize',
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {tab === 'profile' && (
          <div>
            {[
              ['Nationality', d.nationality || '—'],
              ['Emirates ID', d.emiratesId || '—'],
              ['Phone (UAE)', d.phoneUae || d.phone || '—'],
              ['Client', driverClient || '—'],
              ['Supplier', driverSupplier || '—'],
              ['Pay structure', d.payStructure || '—'],
              ['Base salary', `AED ${(d.baseSalary || 0).toLocaleString()}`],
              ['Join date', formatDate(d.joinDate)],
              ['Passport number', d.passportNumber || '—'],
              ['Passport expiry', formatDate(d.passportExpiry)],
              ['Visa number', d.visaNumber || '—'],
              ['Visa type', d.visaType || '—'],
              ['Visa expiry', formatDate(d.visaExpiry)],
              ['Labour card no.', d.labourCardNo || '—'],
              ['Labour card expiry', formatDate(d.labourCardExpiry)],
              ['Vehicle plate', d.vehiclePlate || d.vehicle || '—'],
            ].map(([l, v]) => (
              <div
                key={l}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '9px 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 13,
                }}
              >
                <span style={{ color: 'var(--text3)' }}>{l}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'financial' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Gross salary</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#4ade80' }}>AED {grossSalary.toLocaleString()}</div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Deductions</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#f87171' }}>AED {deductionsAmt.toLocaleString()}</div>
              </div>
              {advanceBalance > 0 && (
                <div
                  style={{
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.2)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    gridColumn: '1/-1',
                  }}
                >
                  <div style={{ fontSize: 10, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Advance outstanding</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#fbbf24' }}>AED {advanceBalance.toLocaleString()}</div>
                </div>
              )}
            </div>
            <SectionHeader title="Ledger — recent entries" />
            {ledgerLoading ? (
              <LoadingSpinner />
            ) : (
              ledger.map((e, i) => {
                const isVehicleRental = e.description?.toLowerCase().includes('vehicle rental') || e.type === 'vehicle_rental';
                const vehiclePlate = isVehicleRental ? (d.vehiclePlate || d.vehicle) : null;
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      padding: '9px 0',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <div style={{ color: 'var(--text)', marginBottom: 2 }}>{e.description}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{e.ref}</div>
                      {vehiclePlate && (
                        <div
                          onClick={() => navigate(`/vehicles?plate=${encodeURIComponent(vehiclePlate)}`)}
                          style={{
                            fontSize: 10,
                            fontFamily: 'var(--mono)',
                            color: 'var(--text3)',
                            marginTop: 3,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          {vehiclePlate} <span style={{ fontSize: 9 }}>↗</span>
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 12,
                        color: e.type === 'debit' || e.amount < 0 ? '#f87171' : '#4ade80',
                        fontWeight: 500,
                      }}
                    >
                      {e.amount < 0 ? '−' : '+'} AED {Math.abs(e.amount).toLocaleString()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'documents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {docsLoading ? (
              <LoadingSpinner />
            ) : (
              documentsList.map((doc) => {
                const status = getExpiryStatus(doc.expiry);
                const statusLabel = status === 'danger' ? 'Expired' : status === 'warning' ? 'Expiring soon' : doc.hasFile ? 'Uploaded' : 'Not uploaded';
                const badgeVariant = !doc.hasFile ? 'default' : status;
                return (
                  <div
                    key={doc.value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: 'var(--surface2)',
                      borderRadius: 10,
                      border: status === 'warning' ? '1px solid rgba(245,158,11,0.2)' : status === 'danger' ? '1px solid rgba(248,113,113,0.2)' : '1px solid var(--border)',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, marginBottom: 2 }}>{doc.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {doc.expiry ? `Expires ${formatDate(doc.expiry)}` : 'No expiry set'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge variant={badgeVariant}>{statusLabel}</Badge>
                      {doc.hasFile && (
                        <button
                          onClick={() => handleViewFile(doc.fileKey, doc.fileUrl)}
                          title="View document"
                          style={{
                            background: 'var(--surface3)',
                            border: '1px solid var(--border2)',
                            color: 'var(--accent)',
                            borderRadius: 6,
                            padding: '5px 7px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <EyeIcon />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'history' && (
          <div>
            {history.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 80, fontSize: 10, color: 'var(--text3)', paddingTop: 2, flexShrink: 0 }}>{typeof h.date === 'string' && h.date.length > 12 ? formatDate(h.date) : h.date}</div>
                <div>
                  <div style={{ fontSize: 13, marginBottom: 3 }}>{h.event}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{h.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <Btn variant="ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowEdit(true)}>Edit profile</Btn>
        <Btn variant="ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowStatusChange(true)}>Change status</Btn>
      </div>

      {showEdit && (
        <EditDriverModal
          driver={d}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['drivers'] });
            queryClient.invalidateQueries({ queryKey: ['driverDocuments', driverId] });
            setShowEdit(false);
            onClose();
          }}
        />
      )}

      {showStatusChange && (
        <ChangeStatusModal
          driver={d}
          onClose={() => setShowStatusChange(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['drivers'] });
            setShowStatusChange(false);
            onClose();
          }}
        />
      )}

      {viewingFile && (
        <Modal title="Document viewer" onClose={() => { if (!viewingFile.isDirect) URL.revokeObjectURL(viewingFile.blobUrl); setViewingFile(null); }} width={700}>
          <div style={{ textAlign: 'center' }}>
            {viewingFile.contentType.includes('pdf') ? (
              <iframe
                src={viewingFile.blobUrl}
                title="Document"
                style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8 }}
              />
            ) : (
              <img
                src={viewingFile.blobUrl}
                alt="Document"
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8 }}
              />
            )}
            <div style={{ marginTop: 12 }}>
              <button
                onClick={handleDownloadFile}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Download file
              </button>
            </div>
          </div>
        </Modal>
      )}
    </SidePanel>
  );
};

const toDateInput = (val) => {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d)) return '';
  return d.toISOString().split('T')[0];
};

const editTabs = ['profile', 'employment', 'documents'];

const EditDriverModal = ({ driver, onClose, onSaved }) => {
  const [editTab, setEditTab] = useState('profile');
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      fullName: driver.fullName || driver.name || '',
      nationality: driver.nationality || '',
      phoneUae: driver.phoneUae || driver.phone || '',
      baseSalary: driver.baseSalary || '',
      payStructure: driver.payStructure || '',
      emiratesId: driver.emiratesId || '',
      clientId: driver.clientId?._id || driver.clientId || '',
      joinDate: toDateInput(driver.joinDate),
      passportNumber: driver.passportNumber || '',
      passportExpiry: toDateInput(driver.passportExpiry),
      visaNumber: driver.visaNumber || '',
      visaType: driver.visaType || '',
      visaExpiry: toDateInput(driver.visaExpiry),
      labourCardNo: driver.labourCardNo || '',
      labourCardExpiry: toDateInput(driver.labourCardExpiry),
      emiratesIdExpiry: toDateInput(driver.emiratesIdExpiry),
      drivingLicenceExpiry: toDateInput(driver.drivingLicenceExpiry),
      mulkiyaExpiry: toDateInput(driver.mulkiyaExpiry),
    },
  });
  const [submitting, setSubmitting] = useState(false);
  const [docUploads, setDocUploads] = useState({});
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const queryClient = useQueryClient();

  const driverId = driver._id || driver.id;

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients(),
  });
  const clients = clientsData?.data || [];

  const { data: existingDocs } = useQuery({
    queryKey: ['driverDocuments', driverId],
    queryFn: () => getDriverDocuments(driverId),
  });
  const uploadedDocMap = {};
  (existingDocs?.data || []).forEach((doc) => { uploadedDocMap[doc.docType] = doc; });

  const onSubmit = async (formData) => {
    setSubmitting(true);
    try {
      await updateDriver(driverId, {
        fullName: formData.fullName,
        nationality: formData.nationality,
        phoneUae: formData.phoneUae,
        baseSalary: Number(formData.baseSalary),
        payStructure: formData.payStructure,
        clientId: formData.clientId,
        emiratesId: formData.emiratesId || undefined,
        joinDate: formData.joinDate || undefined,
        passportNumber: formData.passportNumber || undefined,
        passportExpiry: formData.passportExpiry || undefined,
        visaNumber: formData.visaNumber || undefined,
        visaType: formData.visaType || undefined,
        visaExpiry: formData.visaExpiry || undefined,
        labourCardNo: formData.labourCardNo || undefined,
        labourCardExpiry: formData.labourCardExpiry || undefined,
        emiratesIdExpiry: formData.emiratesIdExpiry || undefined,
        drivingLicenceExpiry: formData.drivingLicenceExpiry || undefined,
        mulkiyaExpiry: formData.mulkiyaExpiry || undefined,
      });
      toast.success('Driver updated successfully');
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update driver');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDocUpload = async (docType, file, expiryField) => {
    if (!file) return;
    setUploadingDoc(docType);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('docType', docType);
      if (expiryField) formData.append('expiryDate', expiryField);
      await uploadDriverDocument(driverId, formData);
      setDocUploads((prev) => ({ ...prev, [docType]: file.name }));
      queryClient.invalidateQueries({ queryKey: ['driverDocuments', driverId] });
      toast.success('Document uploaded');
    } catch {
      toast.error('Failed to upload document');
    } finally {
      setUploadingDoc(null);
    }
  };

  const fieldStyle = { marginBottom: 14 };
  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };
  const errorStyle = { color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' };
  const tabBtnStyle = (active) => ({
    padding: '8px 16px',
    fontSize: 12,
    background: 'transparent',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--accent)' : 'var(--text3)',
    fontWeight: active ? 500 : 400,
    cursor: 'pointer',
    textTransform: 'capitalize',
  });

  const docRowFields = [
    { type: 'passport', label: 'Passport', numField: 'passportNumber', numPlaceholder: 'AB1234567', expiryField: 'passportExpiry' },
    { type: 'visa', label: 'Visa', numField: 'visaNumber', numPlaceholder: 'Visa number', expiryField: 'visaExpiry', extra: 'visaType' },
    { type: 'emirates_id', label: 'Emirates ID', numField: 'emiratesId', numPlaceholder: '784-XXXX-XXXXXXX-X', expiryField: 'emiratesIdExpiry' },
    { type: 'labour_card', label: 'Labour Card', numField: 'labourCardNo', numPlaceholder: 'Labour card number', expiryField: 'labourCardExpiry' },
    { type: 'driving_licence', label: 'Driving Licence', numField: null, expiryField: 'drivingLicenceExpiry' },
    { type: 'mulkiya', label: 'Mulkiya', numField: null, expiryField: 'mulkiyaExpiry' },
  ];

  return (
    <Modal title="Edit driver" onClose={onClose} width={580}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16, marginTop: -4 }}>
        {editTabs.map((t) => (
          <button key={t} onClick={() => setEditTab(t)} style={tabBtnStyle(editTab === t)}>{t}</button>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Profile tab */}
        {editTab === 'profile' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Full name *</label>
              <input
                {...register('fullName', {
                  required: 'Full name is required',
                  minLength: { value: 2, message: 'Must be at least 2 characters' },
                })}
              />
              {errors.fullName && <span style={errorStyle}>{errors.fullName.message}</span>}
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Nationality *</label>
              <input {...register('nationality', { required: 'Nationality is required' })} />
              {errors.nationality && <span style={errorStyle}>{errors.nationality.message}</span>}
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>UAE Phone *</label>
              <input
                {...register('phoneUae', {
                  required: 'UAE phone number is required',
                  pattern: { value: /^\+971\d{9}$/, message: 'Must match format +971XXXXXXXXX' },
                })}
              />
              {errors.phoneUae && <span style={errorStyle}>{errors.phoneUae.message}</span>}
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Emirates ID</label>
              <input
                {...register('emiratesId', {
                  pattern: { value: /^784-\d{4}-\d{7}-\d{1}$/, message: 'Must match format 784-XXXX-XXXXXXX-X' },
                })}
                placeholder="784-XXXX-XXXXXXX-X"
              />
              {errors.emiratesId && <span style={errorStyle}>{errors.emiratesId.message}</span>}
            </div>
          </div>
        )}

        {/* Employment tab */}
        {editTab === 'employment' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Client *</label>
              <select {...register('clientId', { required: 'Client is required' })}>
                <option value="">Select client</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
              {errors.clientId && <span style={errorStyle}>{errors.clientId.message}</span>}
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Pay structure *</label>
              <select {...register('payStructure', { required: 'Pay structure is required' })}>
                <option value="">Select pay structure</option>
                <option value="MONTHLY_FIXED">Monthly fixed</option>
                <option value="DAILY_RATE">Daily rate</option>
                <option value="PER_TRIP">Per trip</option>
              </select>
              {errors.payStructure && <span style={errorStyle}>{errors.payStructure.message}</span>}
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Base salary *</label>
              <input
                type="number"
                step="any"
                {...register('baseSalary', {
                  required: 'Base salary is required',
                  min: { value: 0.01, message: 'Must be a positive number' },
                })}
              />
              {errors.baseSalary && <span style={errorStyle}>{errors.baseSalary.message}</span>}
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Joining date</label>
              <input type="date" {...register('joinDate')} />
            </div>
          </div>
        )}

        {/* Documents tab */}
        {editTab === 'documents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {docRowFields.map((doc) => {
              const existing = uploadedDocMap[doc.type];
              const justUploaded = docUploads[doc.type];
              const isUploading = uploadingDoc === doc.type;
              return (
                <div
                  key={doc.type}
                  style={{
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>{doc.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {doc.numField && (
                      <div>
                        <label style={labelStyle}>{doc.label === 'Emirates ID' ? 'ID Number' : 'Number'}</label>
                        <input {...register(doc.numField)} placeholder={doc.numPlaceholder} />
                      </div>
                    )}
                    {doc.expiryField && (
                      <div>
                        <label style={labelStyle}>Expiry date</label>
                        <input type="date" {...register(doc.expiryField)} />
                      </div>
                    )}
                    {doc.extra === 'visaType' && (
                      <div>
                        <label style={labelStyle}>Visa type</label>
                        <select {...register('visaType')}>
                          <option value="">Select type</option>
                          <option value="employment">Employment</option>
                          <option value="investor">Investor</option>
                          <option value="family">Family</option>
                          <option value="visit">Visit</option>
                        </select>
                      </div>
                    )}
                    <div style={{ gridColumn: doc.numField && doc.expiryField ? '1/-1' : undefined }}>
                      <label style={labelStyle}>Upload scan</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) handleDocUpload(doc.type, file);
                          }}
                          disabled={isUploading}
                          style={{ fontSize: 12, flex: 1 }}
                        />
                        {isUploading && <LoadingSpinner />}
                      </div>
                      {(justUploaded || existing?.fileKey) && (
                        <div style={{ fontSize: 11, color: '#4ade80', marginTop: 4 }}>
                          {justUploaded ? `Uploaded: ${justUploaded}` : 'File on record'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save changes'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending_kyc', label: 'Pending KYC' },
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'resigned', label: 'Resigned' },
  { value: 'offboarding', label: 'Offboarding' },
];

const ChangeStatusModal = ({ driver, onClose, onSaved }) => {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { status: driver.status || 'draft', reason: '' },
  });
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (formData) => {
    setSubmitting(true);
    try {
      await changeDriverStatus(driver._id || driver.id, {
        status: formData.status,
        reason: formData.reason || undefined,
      });
      toast.success('Status updated successfully');
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update status');
    } finally {
      setSubmitting(false);
    }
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };
  const errorStyle = { color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' };

  return (
    <Modal title="Change driver status" onClose={onClose} width={400}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Current status</label>
          <StatusBadge status={driver.status || 'draft'} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>New status *</label>
          <select {...register('status', { required: 'Status is required' })}>
            {statusOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {errors.status && <span style={errorStyle}>{errors.status.message}</span>}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Reason</label>
          <textarea
            {...register('reason', { maxLength: { value: 500, message: 'Must be under 500 characters' } })}
            rows={3}
            placeholder="Optional reason for status change..."
            style={{ width: '100%', resize: 'vertical' }}
          />
          {errors.reason && <span style={errorStyle}>{errors.reason.message}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={submitting}>
            {submitting ? 'Updating...' : 'Update status'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default DriverDetail;
