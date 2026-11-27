const mongoose = require('mongoose');

// Defaults are blank: no company's details are built in. Each company's admin
// fills them in under Settings (provisioning starts them with the company name).
const companySettingsSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: '' },
    addressLine1: { type: String, default: '' },
    addressLine2: { type: String, default: '' },
    country: { type: String, default: 'United Arab Emirates' },
    email: { type: String, default: '' },
    trn: { type: String, default: '' },
    phone: { type: String, default: '' },

    // Bank details
    bankAccountName: { type: String, default: '' },
    bankName: { type: String, default: '' },
    bankAccountNo: { type: String, default: '' },
    bankIban: { type: String, default: '' },

    // Branding
    logoBase64: { type: String, default: '' },
    stampBase64: { type: String, default: '' },
    signatureBase64: { type: String, default: '' },

    // Invoice settings
    invoicePrefix: { type: String, default: 'INV' },
    invoiceNumberFormat: { type: String, default: '{prefix}-{seq}-{mmdd}' },
    disputeNoticeDays: { type: Number, default: 7 },
    vatRate: { type: Number, default: 0.05 },
  },
  { timestamps: true }
);

/**
 * Singleton helper — always returns the single CompanySettings document,
 * creating one with defaults if none exists.
 */
companySettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

const CompanySettings = mongoose.model('CompanySettings', companySettingsSchema);
module.exports = CompanySettings;
module.exports.schema = companySettingsSchema;
