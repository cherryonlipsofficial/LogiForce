import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Btn from '../ui/Btn';
import Modal from '../ui/Modal';
import PermissionGate from '../ui/PermissionGate';
import { verifyContacts, setClientUserId, activateDriver } from '../../api/driversApi';

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
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);
  const queryClient = useQueryClient();
  const driverId = driver._id || driver.id;
  const status = driver.status;
  const summary = statusSummary || {};

  const invalidateDriver = () => {
    queryClient.invalidateQueries({ queryKey: ['driver', driverId] });
    queryClient.invalidateQueries({ queryKey: ['driver-status-summary', driverId] });
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
      toast.success('Client User ID saved successfully');
      setClientUserIdInput('');
      invalidateDriver();
      onActionComplete?.();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to save Client User ID'),
  });

  const activateDriverMutation = useMutation({
    mutationFn: () => activateDriver(driverId, { personalVerificationConfirmed: true }),
    onSuccess: () => {
      setShowActivateConfirm(false);
      toast.success('Driver activated successfully');
      invalidateDriver();
      onActionComplete?.();
    },
    onError: (err) => {
      setShowActivateConfirm(false);
      toast.error(err?.response?.data?.message || 'Failed to activate driver');
    },
  });

  // Don't render banner until status summary API has loaded
  if (!statusSummary) return null;

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
          {/* Passport submission status */}
          {driver.isPassportSubmitted ? (
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: '#4ade80' }}>
              <CheckIcon />
              <span>
                {driver.passportSubmissionType === 'guarantee'
                  ? `Passport submitted: Guarantee${driver.guaranteeExpiryDate ? ` (expires ${formatDate(driver.guaranteeExpiryDate)})` : ''}`
                  : 'Passport submitted: Own passport'}
                {driver.passportSubmissionType === 'guarantee' && driver.guaranteeExpiryDate && new Date(driver.guaranteeExpiryDate) < new Date()
                  ? <span style={{ color: '#f87171' }}> — Guarantee expired</span>
                  : null}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: '#f87171' }}>
              <CrossIcon />
              <span>Passport submitted — no</span>
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          Fill all Profile &amp; Employment fields, submit passport, and save to progress to Pending KYC.
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
          {allDocsValid
            ? 'Verify contact details and update the status to Active.'
            : 'Pending KYC — Upload required documents.'}
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
      <>
        <div style={boxStyles.blue}>
          <div style={{ marginBottom: 6 }}>
            <CheckIcon /> All KYC documents uploaded and valid.
          </div>
          <div style={{ fontWeight: 500, marginBottom: 10 }}>
            Compliance team can now activate this driver.
          </div>
          <PermissionGate permission="drivers.activate">
            <Btn
              variant="success"
              onClick={() => setShowActivateConfirm(true)}
              disabled={activateDriverMutation.isPending}
              small
            >
              Activate driver
            </Btn>
          </PermissionGate>
        </div>

        {showActivateConfirm && (
          <Modal title="Confirm Personal Verification" onClose={() => setShowActivateConfirm(false)} width={420}>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.5 }}>
                Before activating this driver, please confirm that you have completed the
                <strong> personal verification</strong> of the driver (e.g. in-person identity check,
                document authenticity, and physical appearance match).
              </div>
              <div style={{
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 12,
                color: '#b45309',
                marginBottom: 20,
              }}>
                This confirmation is mandatory. By proceeding, you certify that the driver's personal
                verification has been done.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Btn
                  variant="ghost"
                  small
                  onClick={() => setShowActivateConfirm(false)}
                  disabled={activateDriverMutation.isPending}
                >
                  Cancel
                </Btn>
                <Btn
                  variant="success"
                  small
                  onClick={() => activateDriverMutation.mutate()}
                  disabled={activateDriverMutation.isPending}
                >
                  {activateDriverMutation.isPending ? 'Activating...' : 'Yes, verification done — Activate'}
                </Btn>
              </div>
            </div>
          </Modal>
        )}
      </>
    );
  }

  // ── Active — show Client User ID update for Operations / Admin ──
  if (status === 'active') {
    return (
      <div>
        {summary.personalVerificationDone && (
          <div style={{ ...boxStyles.green, marginBottom: 10, fontSize: 12 }}>
            <CheckIcon /> Personal verification done
            {summary.personalVerificationAt ? ` on ${formatDate(summary.personalVerificationAt)}` : ''}
          </div>
        )}
      <PermissionGate permission="drivers.update_client_id">
        <div style={boxStyles.green}>
          {driver.clientUserId && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
              Current Client User ID: <strong style={{ color: 'var(--text1)' }}>{driver.clientUserId}</strong>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
                {driver.clientUserId ? 'Update Client User ID' : 'Set Client User ID'}
              </label>
              <input
                type="text"
                placeholder={driver.clientUserId || 'e.g. AMZ-00814'}
                value={clientUserIdInput}
                onChange={(e) => setClientUserIdInput(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <Btn
              variant="ghost"
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
              {setClientUserIdMutation.isPending ? 'Saving...' : 'Save'}
            </Btn>
          </div>
        </div>
      </PermissionGate>
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

  // ── Offboarded ──
  if (status === 'offboarded') {
    const reason = summary.lastStatusChange?.reason || '';
    return (
      <div style={boxStyles.purple}>
        <span style={{ fontWeight: 500 }}>Offboarded</span>
        {reason && <span style={{ color: 'var(--text3)' }}> — {reason}</span>}
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
