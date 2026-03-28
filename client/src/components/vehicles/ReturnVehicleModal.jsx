import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import Avatar from '../ui/Avatar';
import { returnVehicle } from '../../api/vehiclesApi';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const getInitials = (name) =>
  (name || '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

const conditionOptions = [
  { value: 'good', label: 'Good condition', sublabel: 'No damage, ready for next driver', color: '#4ade80' },
  { value: 'minor_damage', label: 'Minor damage', sublabel: 'Small scratches or dents', color: '#fbbf24' },
  { value: 'major_damage', label: 'Major damage', sublabel: 'Significant damage, needs repair', color: '#f87171' },
  { value: 'total_loss', label: 'Total loss', sublabel: 'Written off or stolen', color: '#f87171' },
];

const ReturnVehicleModal = ({ assignment, vehicle, onClose, onSuccess }) => {
  const { isMobile } = useBreakpoint();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      returnCondition: '',
      damageNotes: '',
      damagePenaltyAmount: 0,
    },
  });

  const condition = watch('returnCondition');
  const showDamageFields = condition && condition !== 'good';
  const isDamageCondition = condition && condition !== 'good';

  const driverName = assignment?.driverName || vehicle?.currentDriverName || 'Unknown driver';
  const driverCode = assignment?.driverEmployeeCode || vehicle?.currentDriverCode || '—';
  const assignedDate = assignment?.assignedDate;
  const monthlyDeduction = assignment?.monthlyDeductionAmount;
  const assignmentId = assignment?._id || vehicle?.currentAssignmentId;

  const daysSince = assignedDate
    ? Math.floor((Date.now() - new Date(assignedDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const { mutate, isPending } = useMutation({
    mutationFn: (data) =>
      returnVehicle(assignmentId, {
        returnCondition: data.returnCondition,
        damageNotes: data.damageNotes || undefined,
        damagePenaltyAmount: data.damagePenaltyAmount ? Number(data.damagePenaltyAmount) : 0,
      }),
    onSuccess: () => {
      toast.success('Vehicle returned successfully');
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle', vehicle._id] });
      queryClient.invalidateQueries({ queryKey: ['fleet-summary'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-current-assignment', vehicle._id] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-assignment-history', vehicle._id] });
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to process return');
    },
  });

  const onSubmit = (data) => {
    mutate(data);
  };

  const plateNumber = vehicle?.plateNumber || vehicle?.plate || '';

  return (
    <Modal onClose={onClose} title={`Return vehicle — ${plateNumber}`} width={480}>
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* SECTION 1 — Current assignment summary */}
        <div
          style={{
            background: 'var(--surface2)',
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Avatar initials={getInitials(driverName)} size={34} />
            <div>
              <div style={{ fontWeight: 500 }}>{driverName}</div>
              <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                {driverCode}
              </div>
            </div>
          </div>
          <div style={{ color: 'var(--text3)', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>Assigned since: {formatDate(assignedDate)}</span>
            {daysSince != null && <span>Duration: {daysSince} days</span>}
            {monthlyDeduction != null && (
              <span>Monthly deduction: AED {Number(monthlyDeduction).toLocaleString()}</span>
            )}
          </div>
        </div>

        {/* SECTION 2 — Return condition (2x2 grid) */}
        <div>
          <label style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 8 }}>
            Vehicle condition on return
          </label>
          <Controller
            name="returnCondition"
            control={control}
            rules={{ required: 'Please select a condition' }}
            render={({ field }) => (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                {conditionOptions.map((opt) => {
                  const selected = field.value === opt.value;
                  return (
                    <div
                      key={opt.value}
                      onClick={() => field.onChange(opt.value)}
                      style={{
                        padding: 12,
                        border: `1px solid ${selected ? opt.color : 'var(--border2)'}`,
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: selected ? `${opt.color}12` : 'transparent',
                        transition: 'all .15s',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{opt.sublabel}</div>
                    </div>
                  );
                })}
              </div>
            )}
          />
          {errors.returnCondition && (
            <div style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{errors.returnCondition.message}</div>
          )}
        </div>

        {/* SECTION 3 — Damage details (conditional) */}
        {showDamageFields && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                Damage description *
              </label>
              <textarea
                {...register('damageNotes', {
                  required: showDamageFields ? 'Damage description is required' : false,
                })}
                placeholder="Describe the damage in detail..."
                style={{
                  width: '100%',
                  minHeight: 80,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border2)',
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  fontSize: 13,
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              {errors.damageNotes && (
                <div style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{errors.damageNotes.message}</div>
              )}
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                Penalty to deduct from driver salary
              </label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: 13,
                    color: 'var(--text3)',
                  }}
                >
                  AED
                </span>
                <input
                  type="number"
                  {...register('damagePenaltyAmount', { min: 0 })}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 42px',
                    borderRadius: 8,
                    border: '1px solid var(--border2)',
                    background: 'var(--surface2)',
                    color: 'var(--text)',
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Leave 0 if no penalty will be charged
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4 — Confirmation note */}
        <div
          style={{
            background: 'var(--surface2)',
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: 12,
            color: 'var(--text3)',
            lineHeight: 1.6,
          }}
        >
          Returning this vehicle will:
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            <li>Set vehicle status to Available</li>
            <li>End this driver's vehicle assignment</li>
            <li>Create a return record in the assignment history</li>
          </ul>
        </div>

        {/* FOOTER */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            paddingTop: 8,
            borderTop: '1px solid var(--border)',
          }}
        >
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant={isDamageCondition ? 'danger' : 'primary'}
            type="submit"
            disabled={isPending}
          >
            {isPending ? (
              <>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'spin 0.6s linear infinite',
                  }}
                />
                Processing...
              </>
            ) : (
              'Process return'
            )}
          </Btn>
        </div>
      </form>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </Modal>
  );
};

export default ReturnVehicleModal;
