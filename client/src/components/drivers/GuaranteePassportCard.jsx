import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Btn from '../ui/Btn';
import PermissionGate from '../ui/PermissionGate';
import { returnGuaranteePassport } from '../../api/driversApi';
import ExtensionRequestModal from './ExtensionRequestModal';
import PassportSubmissionModal from './PassportSubmissionModal';

const formatShortDate = (val) => {
  if (!val) return '--';
  const d = new Date(val);
  if (isNaN(d)) return '--';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusColors = {
  active: { bg: 'rgba(74,222,128,0.1)', color: '#4ade80', label: 'Active' },
  extended: { bg: 'rgba(79,142,247,0.1)', color: '#4f8ef7', label: 'Extended' },
  expired: { bg: 'rgba(248,113,113,0.1)', color: '#f87171', label: 'Expired' },
  returned: { bg: 'rgba(139,144,158,0.1)', color: '#8b909e', label: 'Returned' },
};

const relationLabels = {
  colleague: 'Colleague',
  fellow_employee: 'Fellow employee',
  friend: 'Friend',
  family_member: 'Family',
  other: 'Other',
};

const GuaranteePassportCard = ({ driverId, guarantee, onActionComplete }) => {
  const [showExtension, setShowExtension] = useState(false);
  const [showNewGuarantee, setShowNewGuarantee] = useState(false);
  const queryClient = useQueryClient();

  const returnMutation = useMutation({
    mutationFn: () => returnGuaranteePassport(guarantee._id),
    onSuccess: () => {
      toast.success('Guarantee passport marked as returned');
      queryClient.invalidateQueries({ queryKey: ['driver-guarantee', driverId] });
      queryClient.invalidateQueries({ queryKey: ['driver', driverId] });
      onActionComplete?.();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to return passport'),
  });

  if (!guarantee) {
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>No guarantee passport on record</div>
        <PermissionGate anyOf={["drivers.manage_passport", "drivers.edit"]}>
          <Btn small variant="ghost" onClick={() => setShowNewGuarantee(true)}>Record guarantee passport</Btn>
        </PermissionGate>
        {showNewGuarantee && (
          <PassportSubmissionModal
            driverId={driverId}
            currentData={{ isPassportSubmitted: true, passportSubmissionType: 'guarantee' }}
            onClose={() => setShowNewGuarantee(false)}
            onSuccess={() => {
              setShowNewGuarantee(false);
              onActionComplete?.();
            }}
            forceGuaranteeStep
          />
        )}
      </div>
    );
  }

  const now = new Date();
  const expiryDate = new Date(guarantee.expiryDate);
  const daysRemaining = Math.ceil((expiryDate - now) / 86400000);
  const status = guarantee.status || (daysRemaining <= 0 ? 'expired' : 'active');
  const sc = statusColors[status] || statusColors.active;
  const ext = guarantee.extensionRequest;

  const canRequestExtension = ['active', 'extended'].includes(status)
    && (!ext || ext.status !== 'pending')
    && daysRemaining <= 14;

  const canReturn = ['active', 'extended'].includes(status);
  const canRecordNew = ['expired', 'returned'].includes(status);

  const getDaysRemainingStyle = () => {
    if (daysRemaining <= 0) return { bg: 'rgba(248,113,113,0.1)', color: '#f87171' };
    if (daysRemaining <= 6) return { bg: 'rgba(248,113,113,0.1)', color: '#f87171' };
    if (daysRemaining <= 14) return { bg: 'rgba(245,158,11,0.1)', color: '#fbbf24' };
    return { bg: 'rgba(74,222,128,0.1)', color: '#4ade80' };
  };
  const daysStyle = getDaysRemainingStyle();

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        background: 'var(--surface2)',
        borderRadius: 10,
        padding: 14,
      }}>
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{guarantee.guarantorName}</span>
          {guarantee.relation && (
            <span style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 4,
              background: 'var(--surface3)', color: 'var(--text2)',
            }}>
              {relationLabels[guarantee.relation] || guarantee.relation}
            </span>
          )}
          <span style={{
            fontSize: 10, padding: '2px 6px', borderRadius: 4,
            background: sc.bg, color: sc.color, fontWeight: 500,
          }}>
            {sc.label}
          </span>
        </div>

        {/* Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text3)' }}>Passport number</span>
            <span style={{ fontFamily: '"DM Mono", monospace' }}>{guarantee.guarantorPassportNumber || '--'}</span>
          </div>
          {guarantee.guarantorPhone && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text3)' }}>Phone</span>
              <span>{guarantee.guarantorPhone}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text3)' }}>Submitted</span>
            <span>{formatShortDate(guarantee.submittedDate)}{guarantee.submittedBy?.name ? ` by ${guarantee.submittedBy.name}` : ''}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text3)' }}>Expires</span>
            <span>{formatShortDate(guarantee.expiryDate)}</span>
          </div>
        </div>

        {/* Days remaining pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '3px 10px',
          borderRadius: 12,
          background: daysStyle.bg,
          color: daysStyle.color,
          fontSize: 11,
          fontWeight: 500,
          marginBottom: 10,
        }}>
          {daysRemaining <= 0
            ? 'EXPIRED'
            : daysRemaining <= 6
              ? `${daysRemaining} days remaining \u2014 URGENT`
              : daysRemaining <= 14
                ? `${daysRemaining} days remaining \u2014 expiring soon`
                : `${daysRemaining} days remaining`}
        </div>

        {/* Extension request status */}
        {ext && ext.status === 'pending' && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 10,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
            fontSize: 11, color: '#fbbf24',
          }}>
            Extension request pending admin approval — {ext.requestedDays} days requested. Reason: {ext.reason}
          </div>
        )}
        {ext && ext.status === 'approved' && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 10,
            background: 'rgba(74,222,128,0.08)', fontSize: 11, color: '#4ade80',
          }}>
            &#10003; Extension approved{ext.reviewedBy?.name ? ` by ${ext.reviewedBy.name}` : ''}{ext.reviewedAt ? ` on ${formatShortDate(ext.reviewedAt)}` : ''}
          </div>
        )}
        {ext && ext.status === 'rejected' && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 10,
            background: 'rgba(248,113,113,0.08)', fontSize: 11, color: '#f87171',
          }}>
            &#10007; Extension rejected{ext.reviewNotes ? ` \u2014 ${ext.reviewNotes}` : ''}
          </div>
        )}

        {/* Action buttons */}
        <PermissionGate permission="drivers.manage_passport">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canRequestExtension && (
              <Btn small variant="ghost" onClick={() => setShowExtension(true)}>Request extension</Btn>
            )}
            {canReturn && (
              <Btn small variant="ghost" onClick={() => returnMutation.mutate()} disabled={returnMutation.isPending}>
                {returnMutation.isPending ? 'Returning...' : 'Return passport'}
              </Btn>
            )}
            {canRecordNew && (
              <Btn small variant="ghost" onClick={() => setShowNewGuarantee(true)}>Record new guarantee</Btn>
            )}
          </div>
        </PermissionGate>
      </div>

      {showExtension && (
        <ExtensionRequestModal
          guarantee={guarantee}
          driverId={driverId}
          onClose={() => setShowExtension(false)}
          onSuccess={() => {
            setShowExtension(false);
            queryClient.invalidateQueries({ queryKey: ['driver-guarantee', driverId] });
            onActionComplete?.();
          }}
        />
      )}

      {showNewGuarantee && (
        <PassportSubmissionModal
          driverId={driverId}
          currentData={{ isPassportSubmitted: true, passportSubmissionType: 'guarantee' }}
          onClose={() => setShowNewGuarantee(false)}
          onSuccess={() => {
            setShowNewGuarantee(false);
            queryClient.invalidateQueries({ queryKey: ['driver-guarantee', driverId] });
            onActionComplete?.();
          }}
          forceGuaranteeStep
        />
      )}
    </div>
  );
};

export default GuaranteePassportCard;
