import { useState } from 'react';

const PassportSubmissionField = ({ driverId, value, onChange, readOnly, onActionComplete, showSaveButton }) => {
  const [showModal, setShowModal] = useState(false);
  const isChecked = value?.isPassportSubmitted || false;
  const passportType = value?.passportSubmissionType || null;

  const handleCheckboxChange = (e) => {
    if (readOnly) return;
    const checked = e.target.checked;
    onChange?.({
      isPassportSubmitted: checked,
      passportSubmissionType: checked ? (passportType || 'own') : null,
    });
  };

  const handleTypeChange = (type) => {
    if (readOnly) return;
    onChange?.({
      isPassportSubmitted: true,
      passportSubmissionType: type,
    });
  };

  const cardStyle = (selected) => ({
    padding: '10px 14px',
    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border2)'}`,
    borderRadius: 8,
    cursor: readOnly && !showSaveButton ? 'default' : 'pointer',
    background: selected ? 'rgba(79,142,247,0.08)' : 'transparent',
    transition: 'all .15s',
    flex: 1,
  });

  // View/detail mode with action buttons
  if (showSaveButton && driverId) {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Passport submission</div>
        {!isChecked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(248,113,113,0.1)',
              color: '#f87171',
              fontWeight: 500,
            }}>
              Passport not submitted
            </span>
            <button
              onClick={() => setShowModal(true)}
              style={{
                background: 'none',
                border: '1px solid var(--border2)',
                color: 'var(--accent)',
                borderRadius: 6,
                padding: '3px 10px',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              Mark as submitted
            </button>
          </div>
        ) : passportType === 'own' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(74,222,128,0.1)',
              color: '#4ade80',
              fontWeight: 500,
            }}>
              &#10003; Own passport submitted
            </span>
            <button
              onClick={() => setShowModal(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text3)',
                cursor: 'pointer',
                fontSize: 11,
                textDecoration: 'underline',
              }}
            >
              Change
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(245,158,11,0.1)',
              color: '#fbbf24',
              fontWeight: 500,
            }}>
              Guarantee passport
            </span>
            <button
              onClick={() => setShowModal(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text3)',
                cursor: 'pointer',
                fontSize: 11,
                textDecoration: 'underline',
              }}
            >
              Change
            </button>
          </div>
        )}

        {showModal && (
          <PassportSubmissionModalInline
            driverId={driverId}
            currentData={value}
            onClose={() => setShowModal(false)}
            onSuccess={() => {
              setShowModal(false);
              onActionComplete?.();
            }}
          />
        )}
      </div>
    );
  }

  // Form mode (Add/Edit driver)
  return (
    <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={handleCheckboxChange}
          style={{
            accentColor: isChecked ? '#4ade80' : undefined,
            width: 16,
            height: 16,
            cursor: 'pointer',
          }}
        />
        <label style={{
          fontSize: 12,
          color: isChecked ? '#4ade80' : 'var(--text3)',
          fontWeight: isChecked ? 500 : 400,
          cursor: 'pointer',
        }}>
          Is Passport Submitted *
        </label>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 24, marginBottom: 10 }}>
        This must be checked before status can change to Pending KYC
      </div>

      {isChecked && (
        <div style={{ display: 'flex', gap: 10, marginLeft: 24 }}>
          <div style={cardStyle(passportType === 'own')} onClick={() => handleTypeChange('own')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 14, height: 14, borderRadius: '50%',
                border: `2px solid ${passportType === 'own' ? 'var(--accent)' : 'var(--border2)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {passportType === 'own' && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                )}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Own passport</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, marginLeft: 20 }}>
              Driver submitted their own passport
            </div>
          </div>
          <div style={cardStyle(passportType === 'guarantee')} onClick={() => handleTypeChange('guarantee')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 14, height: 14, borderRadius: '50%',
                border: `2px solid ${passportType === 'guarantee' ? 'var(--accent)' : 'var(--border2)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {passportType === 'guarantee' && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                )}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Guarantee passport</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, marginLeft: 20 }}>
              A guarantor submitted their passport
            </div>
          </div>
        </div>
      )}

      {isChecked && passportType === 'guarantee' && !driverId && (
        <div style={{
          marginTop: 10,
          marginLeft: 24,
          padding: '8px 12px',
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 8,
          fontSize: 11,
          color: '#fbbf24',
        }}>
          Guarantee passport details must be recorded after saving the driver.
          Go to the driver profile to record guarantor information.
        </div>
      )}
    </div>
  );
};

// Minimal inline modal for view mode — delegates to the full PassportSubmissionModal
const PassportSubmissionModalInline = ({ driverId, currentData, onClose, onSuccess }) => {
  // Lazy import to avoid circular deps
  const [Modal, setModal] = useState(null);
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    import('./PassportSubmissionModal').then((mod) => {
      setModal(() => mod.default);
      setLoaded(true);
    });
    return null;
  }

  if (!Modal) return null;
  return <Modal driverId={driverId} currentData={currentData} onClose={onClose} onSuccess={onSuccess} />;
};

export default PassportSubmissionField;
