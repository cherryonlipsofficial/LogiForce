import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import { requestExtension } from '../../api/driversApi';

const formatShortDate = (val) => {
  if (!val) return '--';
  const d = new Date(val);
  if (isNaN(d)) return '--';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const ExtensionRequestModal = ({ guarantee, driverId, onClose, onSuccess }) => {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: { requestedDays: '', reason: '' },
  });

  const requestedDays = watch('requestedDays');
  const expiryDate = new Date(guarantee.expiryDate);
  const daysRemaining = Math.ceil((expiryDate - new Date()) / 86400000);
  const extensionCount = guarantee.extensionCount || 0;

  const newExpiry = requestedDays
    ? (() => { const d = new Date(expiryDate); d.setDate(d.getDate() + Number(requestedDays)); return d; })()
    : null;

  const mutation = useMutation({
    mutationFn: (data) => requestExtension(guarantee._id, data),
    onSuccess: () => {
      toast.success('Extension request submitted \u2014 awaiting admin approval');
      onSuccess?.();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to submit extension request'),
  });

  const onSubmit = (data) => {
    mutation.mutate({
      requestedDays: Number(data.requestedDays),
      reason: data.reason,
    });
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };
  const errorStyle = { color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' };

  return (
    <Modal title="Request guarantee extension" onClose={onClose} width={440}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
          Current expiry: <strong style={{ color: 'var(--text)' }}>{formatShortDate(guarantee.expiryDate)}</strong>
          {' '}({daysRemaining > 0 ? `${daysRemaining} days remaining` : 'EXPIRED'})
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          Guarantor: <strong style={{ color: 'var(--text)' }}>{guarantee.guarantorName}</strong>
        </div>
      </div>

      {extensionCount > 0 && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 14,
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
          fontSize: 11, color: '#fbbf24',
        }}>
          This guarantee has already been extended {extensionCount} time(s).
          Further extensions require strong justification.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Additional days needed *</label>
          <input
            type="number"
            min="1"
            max="30"
            {...register('requestedDays', {
              required: 'Number of days is required',
              min: { value: 1, message: 'Minimum 1 day' },
              max: { value: 30, message: 'Maximum 30 days' },
            })}
            placeholder="e.g. 15"
          />
          {errors.requestedDays && <span style={errorStyle}>{errors.requestedDays.message}</span>}
          {newExpiry && (
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
              New expiry would be: <strong>{formatShortDate(newExpiry)}</strong>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Reason for extension *</label>
          <textarea
            {...register('reason', {
              required: 'Reason is required',
              minLength: { value: 20, message: 'Please provide at least 20 characters' },
            })}
            placeholder="Explain why the guarantee passport needs more time..."
            rows={3}
            style={{ width: '100%', resize: 'vertical' }}
          />
          {errors.reason && <span style={errorStyle}>{errors.reason.message}</span>}
          <span style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginTop: 2 }}>
            Be specific \u2014 this goes to admin for approval
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Submitting...' : 'Submit request'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default ExtensionRequestModal;
