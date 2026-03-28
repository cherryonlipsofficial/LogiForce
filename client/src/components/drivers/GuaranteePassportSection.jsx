import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import Btn from '../ui/Btn';
import Badge from '../ui/Badge';
import SectionHeader from '../ui/SectionHeader';
import Modal from '../ui/Modal';
import LoadingSpinner from '../ui/LoadingSpinner';
import PermissionGate from '../ui/PermissionGate';
import {
  submitOwnPassport,
  recordGuaranteePassport,
  getActiveGuarantee,
  getGuaranteeHistory,
  requestGuaranteeExtension,
  reviewGuaranteeExtension,
  returnGuaranteePassport,
} from '../../api/driversApi';
import { useAuth } from '../../context/AuthContext';

const formatDate = (val) => {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusColors = {
  active: 'success',
  extended: 'warning',
  expired: 'danger',
  returned: 'default',
  replaced: 'default',
};

const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };
const fieldStyle = { marginBottom: 14 };
const errorStyle = { color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' };

const GuaranteePassportSection = ({ driver }) => {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const driverId = driver._id || driver.id;
  const [showGuaranteeForm, setShowGuaranteeForm] = useState(false);
  const [showExtensionForm, setShowExtensionForm] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { data: guaranteeData, isLoading } = useQuery({
    queryKey: ['driver-guarantee', driverId],
    queryFn: () => getActiveGuarantee(driverId),
  });
  const activeGuarantee = guaranteeData?.data || null;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['driver-guarantee', driverId] });
    queryClient.invalidateQueries({ queryKey: ['driver', driverId] });
    queryClient.invalidateQueries({ queryKey: ['driver-status-summary', driverId] });
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
    queryClient.invalidateQueries({ queryKey: ['guarantee-history', driverId] });
  };

  const ownPassportMutation = useMutation({
    mutationFn: () => submitOwnPassport(driverId),
    onSuccess: () => {
      toast.success('Own passport submission recorded');
      invalidateAll();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to record passport'),
  });

  const passportSubmitted = driver.isPassportSubmitted;
  const passportType = driver.passportSubmissionType;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <SectionHeader title="Passport Submission" />

      {/* Current Status */}
      {passportSubmitted ? (
        <div style={{
          background: 'rgba(74,222,128,0.08)',
          border: '1px solid rgba(74,222,128,0.2)',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 14,
          fontSize: 13,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#4ade80', fontWeight: 700, fontSize: 14 }}>&#10003;</span>
            <span>Passport submitted — <strong>{passportType === 'guarantee' ? 'Guarantee passport' : 'Own passport'}</strong></span>
          </div>
        </div>
      ) : (
        <div style={{
          background: 'rgba(248,113,113,0.08)',
          border: '1px solid rgba(248,113,113,0.2)',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 14,
          fontSize: 13,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ color: '#f87171', fontWeight: 700, fontSize: 14 }}>&#10007;</span>
            <span>Passport not yet submitted. Required to advance beyond Draft status.</span>
          </div>
          <PermissionGate permission="drivers.edit">
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn
                variant="primary"
                small
                onClick={() => ownPassportMutation.mutate()}
                disabled={ownPassportMutation.isPending}
              >
                {ownPassportMutation.isPending ? 'Saving...' : 'Mark own passport submitted'}
              </Btn>
              <Btn variant="ghost" small onClick={() => setShowGuaranteeForm(true)}>
                Record guarantee passport
              </Btn>
            </div>
          </PermissionGate>
        </div>
      )}

      {/* Active Guarantee Details */}
      {activeGuarantee && (
        <div style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px',
          marginBottom: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Active Guarantee</span>
            <Badge variant={statusColors[activeGuarantee.status] || 'default'}>
              {activeGuarantee.status}
            </Badge>
          </div>
          {[
            ['Guarantor', activeGuarantee.guarantorName],
            ['Relation', activeGuarantee.guarantorRelation],
            ['Guarantor phone', activeGuarantee.guarantorPhone || '—'],
            ['Passport number', activeGuarantee.guarantorPassportNumber],
            ['Submitted', formatDate(activeGuarantee.submittedDate)],
            ['Expires', formatDate(activeGuarantee.expiryDate)],
            ['Extensions', `${activeGuarantee.extensionCount || 0}`],
          ].map(([label, value]) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', padding: '5px 0',
              borderBottom: '1px solid var(--border)', fontSize: 12,
            }}>
              <span style={{ color: 'var(--text3)' }}>{label}</span>
              <span>{value}</span>
            </div>
          ))}

          {/* Extension request status */}
          {activeGuarantee.extensionRequest?.status === 'pending' && (
            <div style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 8,
              padding: '8px 12px',
              marginTop: 10,
              fontSize: 12,
            }}>
              <strong>Extension pending</strong> — {activeGuarantee.extensionRequest.requestedDays} days requested.
              {activeGuarantee.extensionRequest.reason && <div style={{ color: 'var(--text3)', marginTop: 4 }}>Reason: {activeGuarantee.extensionRequest.reason}</div>}
              {isAdmin && (
                <div style={{ marginTop: 8 }}>
                  <Btn variant="primary" small onClick={() => setShowReviewForm(true)}>Review extension</Btn>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <PermissionGate permission="drivers.edit">
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {!activeGuarantee.extensionRequest?.status || activeGuarantee.extensionRequest?.status !== 'pending' ? (
                <Btn variant="ghost" small onClick={() => setShowExtensionForm(true)}>Request extension</Btn>
              ) : null}
              <Btn variant="ghost" small onClick={() => setShowReturnConfirm(true)}>Return passport</Btn>
              <Btn variant="ghost" small onClick={() => setShowGuaranteeForm(true)}>Replace guarantee</Btn>
            </div>
          </PermissionGate>
        </div>
      )}

      {/* Record guarantee even if passport already submitted as own — allow switching */}
      {passportSubmitted && passportType === 'own' && (
        <PermissionGate permission="drivers.edit">
          <div style={{ marginBottom: 14 }}>
            <Btn variant="ghost" small onClick={() => setShowGuaranteeForm(true)}>
              Switch to guarantee passport
            </Btn>
          </div>
        </PermissionGate>
      )}

      {/* History link */}
      <Btn variant="ghost" small onClick={() => setShowHistory(true)} style={{ fontSize: 11 }}>
        View guarantee history
      </Btn>

      {/* ── Guarantee Form Modal ── */}
      {showGuaranteeForm && (
        <GuaranteeFormModal
          driverId={driverId}
          onClose={() => setShowGuaranteeForm(false)}
          onSuccess={() => { setShowGuaranteeForm(false); invalidateAll(); }}
        />
      )}

      {/* ── Extension Request Modal ── */}
      {showExtensionForm && activeGuarantee && (
        <ExtensionRequestModal
          guaranteeId={activeGuarantee._id}
          onClose={() => setShowExtensionForm(false)}
          onSuccess={() => { setShowExtensionForm(false); invalidateAll(); }}
        />
      )}

      {/* ── Review Extension Modal (Admin) ── */}
      {showReviewForm && activeGuarantee && (
        <ReviewExtensionModal
          guarantee={activeGuarantee}
          onClose={() => setShowReviewForm(false)}
          onSuccess={() => { setShowReviewForm(false); invalidateAll(); }}
        />
      )}

      {/* ── Return Confirm Modal ── */}
      {showReturnConfirm && activeGuarantee && (
        <ReturnConfirmModal
          guaranteeId={activeGuarantee._id}
          guarantorName={activeGuarantee.guarantorName}
          onClose={() => setShowReturnConfirm(false)}
          onSuccess={() => { setShowReturnConfirm(false); invalidateAll(); }}
        />
      )}

      {/* ── History Modal ── */}
      {showHistory && (
        <GuaranteeHistoryModal
          driverId={driverId}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
};

/* ────────────────────────────────────────── */
/*  Sub-modals                                */
/* ────────────────────────────────────────── */

const GuaranteeFormModal = ({ driverId, onClose, onSuccess }) => {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (data) => {
    setSubmitting(true);
    try {
      await recordGuaranteePassport(driverId, data);
      toast.success('Guarantee passport recorded');
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to record guarantee passport');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Record Guarantee Passport" onClose={onClose} width={500}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Guarantor name *</label>
            <input {...register('guarantorName', { required: 'Required' })} />
            {errors.guarantorName && <span style={errorStyle}>{errors.guarantorName.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Relation *</label>
            <select {...register('guarantorRelation', { required: 'Required' })}>
              <option value="">Select</option>
              <option value="colleague">Colleague</option>
              <option value="friend">Friend</option>
              <option value="family">Family</option>
              <option value="other_employee">Other employee</option>
            </select>
            {errors.guarantorRelation && <span style={errorStyle}>{errors.guarantorRelation.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Guarantor phone</label>
            <input {...register('guarantorPhone')} placeholder="+971XXXXXXXXX" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Employee code</label>
            <input {...register('guarantorEmployeeCode')} placeholder="DRV-00001 (if employee)" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Passport number *</label>
            <input {...register('guarantorPassportNumber', { required: 'Required' })} />
            {errors.guarantorPassportNumber && <span style={errorStyle}>{errors.guarantorPassportNumber.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Passport expiry</label>
            <input type="date" {...register('guarantorPassportExpiry')} />
          </div>
          <div style={{ gridColumn: '1/-1', ...fieldStyle }}>
            <label style={labelStyle}>Submitted date</label>
            <input type="date" {...register('submittedDate')} />
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Defaults to today if empty</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Record guarantee'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

const ExtensionRequestModal = ({ guaranteeId, onClose, onSuccess }) => {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (data) => {
    setSubmitting(true);
    try {
      await requestGuaranteeExtension(guaranteeId, {
        requestedDays: Number(data.requestedDays),
        reason: data.reason,
      });
      toast.success('Extension request submitted');
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to request extension');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Request Extension" onClose={onClose} width={420}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Extra days (1–30) *</label>
          <input
            type="number"
            min="1"
            max="30"
            {...register('requestedDays', {
              required: 'Required',
              min: { value: 1, message: 'Min 1 day' },
              max: { value: 30, message: 'Max 30 days' },
            })}
          />
          {errors.requestedDays && <span style={errorStyle}>{errors.requestedDays.message}</span>}
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Reason *</label>
          <textarea
            {...register('reason', { required: 'Required' })}
            rows={3}
            style={{ width: '100%', resize: 'vertical' }}
          />
          {errors.reason && <span style={errorStyle}>{errors.reason.message}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit request'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

const ReviewExtensionModal = ({ guarantee, onClose, onSuccess }) => {
  const [decision, setDecision] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!decision) { toast.error('Select a decision'); return; }
    if (decision === 'rejected' && !reviewNotes.trim()) { toast.error('Notes required when rejecting'); return; }
    setSubmitting(true);
    try {
      await reviewGuaranteeExtension(guarantee._id, { decision, reviewNotes });
      toast.success(`Extension ${decision}`);
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to review extension');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Review Extension Request" onClose={onClose} width={420}>
      <div style={{ marginBottom: 14, fontSize: 13 }}>
        <strong>{guarantee.extensionRequest.requestedDays} extra days</strong> requested.
        {guarantee.extensionRequest.reason && (
          <div style={{ color: 'var(--text3)', marginTop: 4 }}>Reason: {guarantee.extensionRequest.reason}</div>
        )}
        <div style={{ marginTop: 4, color: 'var(--text3)' }}>
          New expiry would be: <strong>{formatDate(guarantee.extensionRequest.newExpiryDate)}</strong>
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Decision *</label>
          <select value={decision} onChange={(e) => setDecision(e.target.value)} style={{ width: '100%' }}>
            <option value="">Select</option>
            <option value="approved">Approve</option>
            <option value="rejected">Reject</option>
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Notes {decision === 'rejected' ? '*' : ''}</label>
          <textarea
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            rows={3}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant={decision === 'rejected' ? 'danger' : 'primary'} type="submit" disabled={submitting}>
            {submitting ? 'Processing...' : decision === 'rejected' ? 'Reject' : 'Approve'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

const ReturnConfirmModal = ({ guaranteeId, guarantorName, onClose, onSuccess }) => {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleReturn = async () => {
    setSubmitting(true);
    try {
      await returnGuaranteePassport(guaranteeId, notes);
      toast.success('Guarantee passport returned');
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to return passport');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Return Guarantee Passport" onClose={onClose} width={420}>
      <p style={{ marginBottom: 14, fontSize: 13 }}>
        Return <strong>{guarantorName}</strong>'s passport? This will clear the driver's passport submission status.
      </p>
      <div style={fieldStyle}>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          style={{ width: '100%', resize: 'vertical' }}
          placeholder="Optional notes about the return"
        />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" onClick={handleReturn} disabled={submitting}>
          {submitting ? 'Returning...' : 'Confirm return'}
        </Btn>
      </div>
    </Modal>
  );
};

const GuaranteeHistoryModal = ({ driverId, onClose }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['guarantee-history', driverId],
    queryFn: () => getGuaranteeHistory(driverId),
  });
  const history = data?.data || [];

  return (
    <Modal title="Guarantee Passport History" onClose={onClose} width={540}>
      {isLoading ? (
        <LoadingSpinner />
      ) : history.length === 0 ? (
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>No guarantee passport records found.</p>
      ) : (
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {history.map((g) => (
            <div
              key={g._id}
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '12px 14px',
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{g.guarantorName}</span>
                <Badge variant={statusColors[g.status] || 'default'}>{g.status}</Badge>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                {g.guarantorRelation} · Passport: {g.guarantorPassportNumber}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                {formatDate(g.submittedDate)} — {formatDate(g.expiryDate)}
                {g.submittedBy?.name && ` · By ${g.submittedBy.name}`}
              </div>
              {g.returnedDate && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  Returned: {formatDate(g.returnedDate)}
                  {g.returnedBy?.name && ` by ${g.returnedBy.name}`}
                  {g.returnNotes && ` — ${g.returnNotes}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

export default GuaranteePassportSection;
