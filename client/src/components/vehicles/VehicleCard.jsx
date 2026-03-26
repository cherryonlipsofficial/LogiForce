import Avatar from '../ui/Avatar';
import Btn from '../ui/Btn';

const statusColors = {
  available: '#4ade80',
  assigned: '#4f8ef7',
  maintenance: '#fbbf24',
  off_hired: '#f87171',
};

const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const VehicleCard = ({ vehicle, onAssign, onReturn, onViewDetail }) => {
  const {
    plateNumber,
    year,
    color,
    status,
    vehicleCategoryId,
    supplierId,
    currentDriverId,
    activeContract,
    currentAssignmentId,
  } = vehicle;

  const stripColor = statusColors[status] || '#888';

  // Contract expiry
  let daysUntilExpiry = null;
  if (activeContract?.endDate) {
    daysUntilExpiry = Math.ceil(
      (new Date(activeContract.endDate) - new Date()) / 86400000
    );
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
        transition: 'border-color 0.15s',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border2)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {/* Status strip */}
      <div
        style={{
          height: 4,
          background: stripColor,
          borderRadius: '14px 14px 0 0',
        }}
      />

      {/* Card body */}
      <div style={{ padding: 14 }}>
        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
              {vehicleCategoryId?.make} {vehicleCategoryId?.model}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {vehicleCategoryId?.name}
            </div>
          </div>
          {supplierId?.name && (
            <div
              style={{
                background: 'var(--surface3)',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                color: 'var(--text3)',
                flexShrink: 0,
                marginLeft: 8,
              }}
            >
              {supplierId.name}
            </div>
          )}
        </div>

        {/* Plate number row */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 500, color: 'var(--text)' }}>
            {plateNumber}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {year} &middot; {color}
          </span>
        </div>

        {/* Assignment zone */}
        <div style={{ marginTop: 10 }}>
          {status === 'assigned' && currentDriverId ? (
            <div
              style={{
                background: 'rgba(79,142,247,0.08)',
                border: '1px solid rgba(79,142,247,0.15)',
                borderRadius: 8,
                padding: '7px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Avatar initials={currentDriverId.initials} size={24} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>{currentDriverId.fullName}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                  {currentDriverId.employeeCode}
                </div>
              </div>
              {currentAssignmentId?.assignedDate && (
                <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'right', flexShrink: 0 }}>
                  Since {formatDate(currentAssignmentId.assignedDate)}
                </div>
              )}
            </div>
          ) : status === 'available' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 0' }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#4ade80',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, color: '#4ade80' }}>Available</span>
            </div>
          ) : null}
        </div>

        {/* Contract expiry warning */}
        {activeContract && daysUntilExpiry !== null && daysUntilExpiry <= 30 && (
          <div style={{ marginTop: 8 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                padding: '2px 8px',
                borderRadius: 4,
                ...(daysUntilExpiry <= 7
                  ? { background: 'rgba(248,113,113,0.12)', color: '#f87171' }
                  : { background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }),
              }}
            >
              Contract expires in {daysUntilExpiry} days
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 10,
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {status === 'available' && (
            <Btn
              small
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); onAssign(vehicle); }}
              style={{ fontSize: 11, padding: '5px 10px' }}
            >
              Assign driver
            </Btn>
          )}
          {status === 'assigned' && (
            <Btn
              small
              onClick={(e) => { e.stopPropagation(); onReturn(vehicle); }}
              style={{
                fontSize: 11,
                padding: '5px 10px',
                background: 'rgba(239,68,68,0.08)',
                color: '#f87171',
                border: '1px solid rgba(239,68,68,0.2)',
              }}
            >
              Return
            </Btn>
          )}

          <Btn
            small
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); onViewDetail(vehicle); }}
            style={{ fontSize: 11, padding: '5px 10px' }}
          >
            View details
          </Btn>

          {activeContract?.monthlyRate != null && (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--text3)',
                marginLeft: 'auto',
              }}
            >
              AED {activeContract.monthlyRate}/mo
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default VehicleCard;
