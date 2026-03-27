import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Btn from '../ui/Btn';
import PermissionGate from '../ui/PermissionGate';
import { verifyContacts, setClientUserId } from '../../api/driversApi';

const formatDate = (val) => {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const CheckIcon = ({ color = '#4ade80' }) => (
  <span style={{ color, fontWeight: 700, fontSize: 14, marginRight: 6 }}>&#10003;</span>
);
const CrossIcon = ({ color = '#f87171' }) => (
  <span style={{ color, fontWeight: 700, fontSize: 14, marginRight: 6 }}>&#10007;</span>
);
const WarnIcon = () => (
  <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 14, marginRight: 6 }}>!</span>
);

const boxBase = {
  borderRadius: 10,
  padding: '12px 14px',
  marginBottom: 0,
  fontSize: 13,
};

const boxStyles = {
  blue: { ...boxBase, background: 'rgba(79,142,247,0.08)', border: '1px solid rgba(79,142,247,0.2)' },
  amber: { ...boxBase, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' },
  green: { ...boxBase, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' },
  red: { ...boxBase, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' },
  purple: { ...boxBase, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' },
};

const REQUIRED_DOCS = [
  { key: 'emirates_id', label: 'Emirates ID' },
  { key: 'passport', label: 'Passport' },
  { key: 'driving_licence', label: 'Driving Licence' },
];

const DriverStatusBanner = ({ driver, statusSummary, onActionComplete }) => {
  const [clientUserIdInput, setClientUserIdInput] = useState('');
  const queryClient = useQueryClient();
  const driverId = driver._id || driver.id;
  const status = driver.status;
  const summary = statusSummary || {};

  // Don't render banner until status summary API has loaded
  if (!statusSummary) return null;

  const invalidateDriver = () => {
    queryClient.invalidateQueries({ queryKey: ['driver', driverId] });
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
  };

  const verifyContactsMutation = useMutation({
    mutationFn: () => verifyContacts(driverId),
    onSuccess: () => {
      toast.success('Contacts marked as verified');
      invalidateDriver();
      onActionComplete?.();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to verify contacts'),
  });

  const setClientUserIdMutation = useMutation({
    mutationFn: (value) => setClientUserId(driverId, value),
    onSuccess: () => {
      toast.success('Driver activated successfully');
      invalidateDriver();
      onActionComplete?.();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to activate driver'),
  });

  // ── Draft ──
  if (status === 'draft') {
    const profileCheck = summary.profileCheck || { complete: false, missing: [] };
    const fieldLabels = {
      fullName: 'Full Name',
      nationality: 'Nationality',
      phoneUae: 'UAE Phone',
      emiratesId: 'Emirates ID',
      projectId: 'Project',
      payStructure: 'Pay Structure',
      baseSalary: 'Base Salary',
      joinDate: 'Joining Date',
    };
    const allFields = [
      ...(summary.requiredProfileFields || ['fullName', 'nationality', 'phoneUae', 'emiratesId']),
      ...(summary.requiredEmploymentFields || ['projectId', 'payStructure', 'baseSalary', 'joinDate']),
    ];
    const missingSet = new Set(profileCheck.missing || []);

    return (
      <div style={boxStyles.blue}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>This driver is in Draft status.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
          {allFields.filter((field) => missingSet.has(field)).map((field) => (
            <div key={field} style={{ display: 'flex', alignItems: 'center', fontSize: 12 }}>
              <CrossIcon />
              <span>{fieldLabels[field] || field} — not filled</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          Fill all Profile &amp; Employment fields and save to progress to Pending KYC.
        </div>
      </div>
    );
  }

  // ── Pending KYC ──
  if (status === 'pending_kyc') {
    const docs = summary.documents || {};
    const hasExpired = REQUIRED_DOCS.some((d) => {
      const doc = docs[d.key];
      return doc && doc.expiry && new Date(doc.expiry) < new Date();
    });
    const allDocsValid = REQUIRED_DOCS.every((d) => {
      const doc = docs[d.key];
      return doc && doc.uploaded && (!doc.expiry || new Date(doc.expiry) >= new Date());
    });

    return (
      <div style={boxStyles.amber}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>
          Pending KYC — Upload documents. Next: verify contact details.
        </div>

        {/* Document validity checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {REQUIRED_DOCS.map((d) => {
            const doc = docs[d.key];
            if (!doc || !doc.uploaded) {
              return (
                <div key={d.key} style={{ display: 'flex', alignItems: 'center', fontSize: 12 }}>
                  <CrossIcon /> <span>{d.label} — missing</span>
                </div>
              );
            }
            const expired = doc.expiry && new Date(doc.expiry) < new Date();
            const noExpiry = !doc.expiry;
            if (expired) {
              return (
                <div key={d.key} style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: '#f87171' }}>
                  <CrossIcon /> <span>{d.label} — Expired on {formatDate(doc.expiry)}</span>
                </div>
              );
            }
            if (noExpiry) {
              return (
                <div key={d.key} style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: '#fbbf24' }}>
                  <WarnIcon /> <span>{d.label} — No expiry date recorded</span>
                </div>
              );
            }
            return (
              <div key={d.key} style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: '#4ade80' }}>
                <CheckIcon /> <span>{d.label} — expires {formatDate(doc.expiry)}</span>
              </div>
            );
          })}
        </div>

        {hasExpired && (
          <div style={{ ...boxStyles.red, marginBottom: 10, fontSize: 12, padding: '8px 12px' }}>
            One or more documents are expired. Update the documents before proceeding.
          </div>
        )}

        {summary.contactsVerified ? (
          <div style={{ fontSize: 12, color: '#4ade80', marginBottom: 4 }}>
            <CheckIcon /> Contacts verified
            {summary.contactsVerifiedBy ? ` by ${summary.contactsVerifiedBy}` : ''}
            {summary.contactsVerifiedAt ? ` on ${formatDate(summary.contactsVerifiedAt)}` : ''}
          </div>
        ) : (
          <>
            {summary.canVerifyContacts && allDocsValid && (
              <>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                  Contact details (emergency, alternate, home country numbers) have been filled in the Profile tab.
                </div>
                <PermissionGate permission="drivers.change_status">
                  <Btn
                    variant="success"
                    onClick={() => verifyContactsMutation.mutate()}
                    disabled={verifyContactsMutation.isPending}
                    small
                  >
                    {verifyContactsMutation.isPending ? 'Verifying...' : 'Mark contacts as verified'}
                  </Btn>
                </PermissionGate>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Pending Verification ──
  if (status === 'pending_verification') {
    return (
      <div style={boxStyles.blue}>
        <div style={{ marginBottom: 6 }}>
          <CheckIcon /> Documents verified. <CheckIcon /> Contacts verified.
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
          Waiting for Operations to assign a Client User ID.
        </div>
        <PermissionGate permission="drivers.change_status">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
                Client User ID (assigned by client)
              </label>
              <input
                type="text"
                placeholder="e.g. AMZ-00814"
                value={clientUserIdInput}
                onChange={(e) => setClientUserIdInput(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <Btn
              variant="success"
              onClick={() => {
                if (!clientUserIdInput.trim()) {
                  toast.error('Please enter a Client User ID');
                  return;
                }
                setClientUserIdMutation.mutate(clientUserIdInput.trim());
              }}
              disabled={setClientUserIdMutation.isPending}
              small
            >
              {setClientUserIdMutation.isPending ? 'Activating...' : 'Activate driver'}
            </Btn>
          </div>
        </PermissionGate>
      </div>
    );
  }

  // ── Active ──
  if (status === 'active') {
    return (
      <div style={{
        ...boxStyles.green,
        padding: '8px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <CheckIcon /> <span style={{ fontWeight: 500 }}>Active</span>
        {driver.clientUserId && (
          <span style={{ color: 'var(--text3)', marginLeft: 4 }}>
            — Client User ID: <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{driver.clientUserId}</span>
          </span>
        )}
      </div>
    );
  }

  // ── On Leave ──
  if (status === 'on_leave') {
    const reason = summary.lastStatusChange?.reason || driver.statusReason || '';
    return (
      <div style={{ ...boxStyles.blue, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontWeight: 500 }}>On leave</span>
          {reason && <span style={{ color: 'var(--text3)' }}> — {reason}</span>}
        </div>
        <PermissionGate permission="drivers.change_status">
          <Btn variant="ghost" small onClick={() => onActionComplete?.('return_active')}>
            Return to Active
          </Btn>
        </PermissionGate>
      </div>
    );
  }

  // ── Suspended ──
  if (status === 'suspended') {
    const reason = summary.lastStatusChange?.reason || driver.statusReason || '';
    return (
      <div style={{ ...boxStyles.red, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontWeight: 500 }}>Suspended</span>
          {reason && <span style={{ color: 'var(--text3)' }}> — {reason}</span>}
        </div>
        <PermissionGate permission="drivers.change_status">
          <Btn variant="ghost" small onClick={() => onActionComplete?.('reinstate')}>
            Reinstate
          </Btn>
        </PermissionGate>
      </div>
    );
  }

  // ── Offboarding ──
  if (status === 'offboarding') {
    return (
      <div style={boxStyles.purple}>
        <span style={{ fontWeight: 500 }}>Offboarding in progress</span>
      </div>
    );
  }

  // ── Resigned / other ──
  if (status === 'resigned') {
    return (
      <div style={{ ...boxStyles.red, padding: '8px 14px' }}>
        <span style={{ fontWeight: 500 }}>Resigned</span>
      </div>
    );
  }

  return null;
};

export default DriverStatusBanner;
