import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  getCompanySettings,
  updateCompanySettings,
  uploadCompanyLogo,
  uploadCompanyStamp,
  uploadCompanySignature,
} from '../../api/settingsApi';

const inputStyle = {
  width: '100%',
  height: 38,
  padding: '0 12px',
  border: '1px solid var(--border2)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 13,
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text2)',
  marginBottom: 5,
};

const sectionTitleStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
  marginBottom: 14,
  paddingBottom: 8,
  borderBottom: '1px solid var(--border)',
};

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 14,
};

function ImageUploadBox({ label, base64Value, onUpload, uploading }) {
  const fileRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }
    onUpload(file);
  };

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div
        style={{
          border: '1px dashed var(--border2)',
          borderRadius: 10,
          padding: 16,
          textAlign: 'center',
          background: 'var(--surface2)',
          minHeight: 100,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {base64Value ? (
          <img
            src={`data:image/png;base64,${base64Value}`}
            alt={label}
            style={{ maxWidth: 160, maxHeight: 80, objectFit: 'contain', borderRadius: 6 }}
          />
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>No image uploaded</div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            fontSize: 12,
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? 'Uploading...' : base64Value ? 'Replace' : 'Upload'}
        </button>
      </div>
    </div>
  );
}

export default function CompanyPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['company-settings'],
    queryFn: getCompanySettings,
  });

  const settings = data?.data || {};

  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings._id) {
      setForm({
        companyName: settings.companyName || '',
        addressLine1: settings.addressLine1 || '',
        addressLine2: settings.addressLine2 || '',
        country: settings.country || '',
        email: settings.email || '',
        trn: settings.trn || '',
        phone: settings.phone || '',
        bankAccountName: settings.bankAccountName || '',
        bankName: settings.bankName || '',
        bankAccountNo: settings.bankAccountNo || '',
        bankIban: settings.bankIban || '',
        invoicePrefix: settings.invoicePrefix || '',
        disputeNoticeDays: settings.disputeNoticeDays ?? 7,
        vatRate: settings.vatRate ?? 0.05,
      });
      setDirty(false);
    }
  }, [settings._id]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: (payload) => updateCompanySettings(payload),
    onSuccess: () => {
      toast.success('Company settings saved');
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      setDirty(false);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to save settings');
    },
  });

  const logoMutation = useMutation({
    mutationFn: (file) => uploadCompanyLogo(file),
    onSuccess: () => {
      toast.success('Logo uploaded');
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
    },
    onError: () => toast.error('Failed to upload logo'),
  });

  const stampMutation = useMutation({
    mutationFn: (file) => uploadCompanyStamp(file),
    onSuccess: () => {
      toast.success('Stamp uploaded');
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
    },
    onError: () => toast.error('Failed to upload stamp'),
  });

  const signatureMutation = useMutation({
    mutationFn: (file) => uploadCompanySignature(file),
    onSuccess: () => {
      toast.success('Signature uploaded');
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
    },
    onError: () => toast.error('Failed to upload signature'),
  });

  const handleSave = () => {
    const payload = {
      ...form,
      disputeNoticeDays: parseInt(form.disputeNoticeDays) || 7,
      vatRate: parseFloat(form.vatRate) || 0.05,
    };
    saveMutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
        Loading company settings...
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#f87171', fontSize: 13 }}>
        Failed to load company settings.
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        padding: 24,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', margin: 0 }}>
            Company Settings
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 0' }}>
            Manage your company details displayed on invoices
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saveMutation.isPending}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            background: dirty ? 'var(--accent)' : 'var(--surface2)',
            color: dirty ? '#fff' : 'var(--text3)',
            border: 'none',
            cursor: dirty ? 'pointer' : 'default',
            opacity: saveMutation.isPending ? 0.7 : 1,
          }}
        >
          {saveMutation.isPending ? 'Saving...' : 'Save changes'}
        </button>
      </div>

      {/* ── Company Information ── */}
      <div style={sectionTitleStyle}>Company Information</div>
      <div style={{ ...gridStyle, marginBottom: 20 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Company Name</label>
          <input style={inputStyle} value={form.companyName || ''} onChange={handleChange('companyName')} />
        </div>
        <div>
          <label style={labelStyle}>Address Line 1</label>
          <input style={inputStyle} value={form.addressLine1 || ''} onChange={handleChange('addressLine1')} placeholder="P.O.Box, Building name" />
        </div>
        <div>
          <label style={labelStyle}>Address Line 2</label>
          <input style={inputStyle} value={form.addressLine2 || ''} onChange={handleChange('addressLine2')} placeholder="Area, City" />
        </div>
        <div>
          <label style={labelStyle}>Country</label>
          <input style={inputStyle} value={form.country || ''} onChange={handleChange('country')} />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input style={inputStyle} type="email" value={form.email || ''} onChange={handleChange('email')} />
        </div>
        <div>
          <label style={labelStyle}>Phone</label>
          <input style={inputStyle} value={form.phone || ''} onChange={handleChange('phone')} />
        </div>
        <div>
          <label style={labelStyle}>TRN (Tax Registration Number)</label>
          <input style={inputStyle} value={form.trn || ''} onChange={handleChange('trn')} />
        </div>
      </div>

      {/* ── Bank Details ── */}
      <div style={sectionTitleStyle}>Bank Account Details</div>
      <div style={{ ...gridStyle, marginBottom: 20 }}>
        <div>
          <label style={labelStyle}>Account Holder Name</label>
          <input style={inputStyle} value={form.bankAccountName || ''} onChange={handleChange('bankAccountName')} />
        </div>
        <div>
          <label style={labelStyle}>Bank Name</label>
          <input style={inputStyle} value={form.bankName || ''} onChange={handleChange('bankName')} />
        </div>
        <div>
          <label style={labelStyle}>Account Number</label>
          <input style={inputStyle} value={form.bankAccountNo || ''} onChange={handleChange('bankAccountNo')} />
        </div>
        <div>
          <label style={labelStyle}>IBAN</label>
          <input style={inputStyle} value={form.bankIban || ''} onChange={handleChange('bankIban')} />
        </div>
      </div>

      {/* ── Invoice Settings ── */}
      <div style={sectionTitleStyle}>Invoice Settings</div>
      <div style={{ ...gridStyle, marginBottom: 20 }}>
        <div>
          <label style={labelStyle}>Invoice Prefix</label>
          <input style={inputStyle} value={form.invoicePrefix || ''} onChange={handleChange('invoicePrefix')} placeholder="e.g. HM" />
        </div>
        <div>
          <label style={labelStyle}>VAT Rate (%)</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={form.vatRate ?? ''}
            onChange={handleChange('vatRate')}
            placeholder="0.05"
          />
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
            Enter as decimal (0.05 = 5%)
          </div>
        </div>
        <div>
          <label style={labelStyle}>Dispute Notice Days</label>
          <input
            style={inputStyle}
            type="number"
            min="1"
            value={form.disputeNoticeDays ?? ''}
            onChange={handleChange('disputeNoticeDays')}
          />
        </div>
      </div>

      {/* ── Branding & Images ── */}
      <div style={sectionTitleStyle}>Branding &amp; Signatures</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <ImageUploadBox
          label="Company Logo"
          base64Value={settings.logoBase64}
          onUpload={(file) => logoMutation.mutate(file)}
          uploading={logoMutation.isPending}
        />
        <ImageUploadBox
          label="Company Stamp / Seal"
          base64Value={settings.stampBase64}
          onUpload={(file) => stampMutation.mutate(file)}
          uploading={stampMutation.isPending}
        />
        <ImageUploadBox
          label="Authorized Signature"
          base64Value={settings.signatureBase64}
          onUpload={(file) => signatureMutation.mutate(file)}
          uploading={signatureMutation.isPending}
        />
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text3)',
          marginTop: 10,
          lineHeight: 1.5,
        }}
      >
        Images are used on generated invoice PDFs. Recommended: PNG with transparent background, max 2MB each.
      </div>
    </div>
  );
}
