const mongoose = require('mongoose');

const companySettingsSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: 'HAYAT AL MADINA DELIVERY SERVICES' },
    addressLine1: { type: String, default: 'P.O.Box 39819, A-36, Al Nayli Building' },
    addressLine2: { type: String, default: 'Industrial Area 13, Sharjah' },
    country: { type: String, default: 'United Arab Emirates' },
    email: { type: String, default: 'accounts@hayatalmadina.net' },
    trn: { type: String, default: '104235095700003' },
    phone: { type: String, default: '' },

    // Bank details
    bankAccountName: { type: String, default: 'Hayat Al Madina Delivery Services' },
    bankName: { type: String, default: 'RAK Bank' },
    bankAccountNo: { type: String, default: '8373194769901' },
    bankIban: { type: String, default: 'AE600400008373194769901' },

    // Branding
    logoBase64: { type: String, default: '' },
    stampBase64: { type: String, default: '' },
    signatureBase64: { type: String, default: '' },

    // Invoice settings
    invoicePrefix: { type: String, default: 'HM' },
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

module.exports = mongoose.model('CompanySettings', companySettingsSchema);
