module.exports = {
  ROLES: {
    ADMIN: 'admin',
    ACCOUNTANT: 'accountant',
    OPS: 'ops',
    COMPLIANCE: 'compliance',
    SALES: 'sales',
  },
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
  ],
  WPS: {
    EMPLOYER_ID: 'LOGIFORCE001',
  },
};
