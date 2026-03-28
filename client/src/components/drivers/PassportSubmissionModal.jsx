import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import { submitOwnPassport, recordGuaranteePassport } from '../../api/driversApi';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const formatDatePreview = (dateStr) => {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  if (isNaN(d)) return '--';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const computeExpiry = (submittedDate) => {
  if (!submittedDate) return null;
  const d = new Date(submittedDate);
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + 30);
  return d;
};

const today = () => new Date().toISOString().split('T')[0];

const PassportSubmissionModal = ({ driverId, currentData, onClose, onSuccess, forceGuaranteeStep }) => {
  const { isMobile } = useBreakpoint();
  const [step, setStep] = useState(forceGuaranteeStep ? 2 : 1);
  const [selectedType, setSelectedType] = useState(forceGuaranteeStep ? 'guarantee' : (currentData?.passportSubmissionType || 'own'));
  const [isSubmitted, setIsSubmitted] = useState(currentData?.isPassportSubmitted ?? true);
  const queryClient = useQueryClient();

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      guarantorName: '',
      guarantorRelation: '',
      guarantorPhone: '',
      employeeCode: '',
      guarantorPassportNumber: '',
      guarantorPassportExpiry: '',
      submittedDate: today(),
      note: '',
    },
  });

  const submittedDate = watch('submittedDate');
  const computedExpiry = computeExpiry(submittedDate);

  const invalidateDriverQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
    queryClient.invalidateQueries({ queryKey: ['driver', driverId] });
    queryClient.invalidateQueries({ queryKey: ['driver-guarantee', driverId] });
    queryClient.invalidateQueries({ queryKey: ['driver-status-summary', driverId] });
  };

  const ownMutation = useMutation({
    mutationFn: () => submitOwnPassport(driverId),
    onSuccess: () => {
      toast.success('Own passport submission recorded');
      invalidateDriverQueries();
      onSuccess?.();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to record passport submission'),
  });

  const guaranteeMutation = useMutation({
    mutationFn: (data) => recordGuaranteePassport(driverId, data),
    onSuccess: () => {
      toast.success(`Guarantee passport recorded \u2014 expires ${computedExpiry ? formatDatePreview(computedExpiry) : 'in 30 days'}`);
      invalidateDriverQueries();
      onSuccess?.();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to record guarantee passport'),
  });

  const handleOwnSubmit = () => ownMutation.mutate();

  const handleGuaranteeSubmit = (formData) => {
    guaranteeMutation.mutate({
      guarantorName: formData.guarantorName,
      guarantorRelation: formData.guarantorRelation,
      guarantorPhone: formData.guarantorPhone || undefined,
      employeeCode: formData.employeeCode || undefined,
      guarantorPassportNumber: formData.guarantorPassportNumber,
      guarantorPassportExpiry: formData.guarantorPassportExpiry || undefined,
      submittedDate: formData.submittedDate,
    });
  };

  const cardStyle = (selected) => ({
    padding: '10px 14px',
    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border2)'}`,
    borderRadius: 8,
    cursor: 'pointer',
    background: selected ? 'rgba(79,142,247,0.08)' : 'transparent',
    transition: 'all .15s',
    flex: 1,
  });

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };
  const errorStyle = { color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' };
  const fieldStyle = { marginBottom: 14 };

  return (
    <Modal title="Passport submission" onClose={onClose} width={480}>
      {step === 1 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={isSubmitted}
              onChange={(e) => setIsSubmitted(e.target.checked)}
              style={{ accentColor: '#4ade80', width: 16, height: 16 }}
            />
            <label style={{ fontSize: 13, fontWeight: 500 }}>Mark passport as submitted</label>
          </div>

          {isSubmitted && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div style={cardStyle(selectedType === 'own')} onClick={() => setSelectedType('own')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: '50%',
                      border: `2px solid ${selectedType === 'own' ? 'var(--accent)' : 'var(--border2)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selectedType === 'own' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>Own passport</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, marginLeft: 20 }}>
                    Driver provided their own passport
                  </div>
                </div>
                <div style={cardStyle(selectedType === 'guarantee')} onClick={() => setSelectedType('guarantee')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: '50%',
                      border: `2px solid ${selectedType === 'guarantee' ? 'var(--accent)' : 'var(--border2)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selectedType === 'guarantee' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>Guarantee passport</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, marginLeft: 20 }}>
                    Guarantor's passport submitted on driver's behalf
                  </div>
                </div>
              </div>

              {selectedType === 'own' && (
                <div style={{
                  padding: '10px 12px', borderRadius: 8, marginBottom: 14,
                  background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
                  fontSize: 12, color: '#4ade80',
                }}>
                  Driver's own passport is on record. No expiry tracking needed for the guarantee.
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            {isSubmitted && selectedType === 'own' && (
              <Btn variant="primary" onClick={handleOwnSubmit} disabled={ownMutation.isPending}>
                {ownMutation.isPending ? 'Saving...' : 'Confirm \u2014 own passport'}
              </Btn>
            )}
            {isSubmitted && selectedType === 'guarantee' && (
              <Btn variant="primary" onClick={() => setStep(2)}>Next &rarr;</Btn>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={handleSubmit(handleGuaranteeSubmit)}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Guarantor name *</label>
            <input {...register('guarantorName', { required: 'Guarantor name is required' })} placeholder="Full name" />
            {errors.guarantorName && <span style={errorStyle}>{errors.guarantorName.message}</span>}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Relation to driver *</label>
            <select {...register('guarantorRelation', { required: 'Relation is required' })}>
              <option value="">Select relation</option>
              <option value="colleague">Colleague</option>
              <option value="fellow_employee">Fellow employee</option>
              <option value="friend">Friend</option>
              <option value="family_member">Family member</option>
              <option value="other">Other</option>
            </select>
            {errors.guarantorRelation && <span style={errorStyle}>{errors.guarantorRelation.message}</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Guarantor phone</label>
              <input {...register('guarantorPhone')} placeholder="+971..." />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Employee code</label>
              <input {...register('employeeCode')} placeholder="If they work here" />
              <span style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginTop: 2 }}>
                Fill this if the guarantor is another employee in our system
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Guarantor passport number *</label>
              <input
                {...register('guarantorPassportNumber', { required: 'Passport number is required' })}
                placeholder="AB1234567"
                style={{ fontFamily: '"DM Mono", monospace' }}
              />
              {errors.guarantorPassportNumber && <span style={errorStyle}>{errors.guarantorPassportNumber.message}</span>}
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Guarantor passport expiry</label>
              <input
                type="date"
                {...register('guarantorPassportExpiry', {
                  validate: (v) => !v || new Date(v) > new Date() || 'Must be in the future',
                })}
              />
              {errors.guarantorPassportExpiry && <span style={errorStyle}>{errors.guarantorPassportExpiry.message}</span>}
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Date guarantee passport was submitted *</label>
            <input type="date" {...register('submittedDate', { required: 'Submitted date is required' })} />
            {errors.submittedDate && <span style={errorStyle}>{errors.submittedDate.message}</span>}
          </div>

          <div style={{
            padding: '10px 12px', borderRadius: 8, marginBottom: 14,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
            fontSize: 11, color: '#fbbf24',
          }}>
            This guarantee passport is valid for 30 days from the submitted date.
            {computedExpiry && (
              <span> It will expire on: <strong>{formatDatePreview(computedExpiry)}</strong></span>
            )}
            <br />Extension beyond 30 days requires admin approval.
          </div>

          {computedExpiry && (
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
              Will expire on: <strong>{formatDatePreview(computedExpiry)}</strong>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {!forceGuaranteeStep && (
              <Btn variant="ghost" onClick={() => setStep(1)}>&larr; Back</Btn>
            )}
            {forceGuaranteeStep && (
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            )}
            <Btn variant="primary" type="submit" disabled={guaranteeMutation.isPending}>
              {guaranteeMutation.isPending ? 'Saving...' : 'Save guarantee passport'}
            </Btn>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default PassportSubmissionModal;
