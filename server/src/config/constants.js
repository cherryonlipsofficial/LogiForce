module.exports = {
  // ROLES constant removed — role names are dynamic.
  // All access control uses permission keys from config/permissions.js.
  // Use isSystemRole flag for admin bypass, never a role name.
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
  },
  SALARY: {
    STANDARD_WORKING_DAYS: 26,
    STANDARD_HOURS_PER_DAY: 8,
    OT_MULTIPLIER: 1.25,
    TRANSPORT_ALLOWANCE: 200,
    MAX_ADVANCE_RECOVERY_RATE: 0.5,
    TELECOM_SIM_MONTHLY_CHARGE: 100,
  },
  DEDUCTION_TYPES: [
    'telecom_sim',
    'vehicle_rental',
    'salik',
    'advance_recovery',
    'penalty',
    'deduction_carryover',
    'credit_note',
    'other',
  ],
  CREDIT_NOTE_TYPES: [
    'traffic_fine',
    'penalty',
    'damage',
    'client_chargeback',
    'attendance_correction',
    'other',
  ],
  WPS: {
    EMPLOYER_ID: 'LOGIFORCE001',
  },
};
