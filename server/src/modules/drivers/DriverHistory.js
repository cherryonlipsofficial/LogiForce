const mongoose = require('mongoose');
const { Schema } = mongoose;

const driverHistorySchema = new Schema({

  driverId: {
    type: Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
    index: true,
  },

  // What type of event this is
  eventType: {
    type: String,
    required: true,
    enum: [
      'status_change',         // any status transition
      'document_uploaded',     // a document was uploaded
      'document_verified',     // a document was marked verified
      'document_expired',      // system detected expiry
      'contacts_verified',     // Compliance clicked Verified
      'client_user_id_set',    // Operations entered client_user_id
      'driver_activated',      // driver manually activated from pending_verification
      'driver_force_activated', // admin force-activated a driver bypassing KYC
      'personal_verification_confirmed', // Compliance confirmed personal verification
      'field_updated',         // general profile field update
      'note_added',            // manual note added
      'driver_created',        // driver profile initially created
      'driver_deleted',        // driver soft-deleted / offboarded
    ],
  },

  // For status changes
  statusFrom:  { type: String },
  statusTo:    { type: String },

  // For document events
  documentType: { type: String }, // 'emirates_id', 'passport', 'driving_licence', etc.

  // For field updates
  fieldName:   { type: String },
  oldValue:    { type: String },
  newValue:    { type: String },

  // Mandatory reason for manual status changes
  reason: { type: String },

  // Who triggered this event
  performedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  performedByName:  { type: String }, // denormalized for quick display
  performedByRole:  { type: String }, // denormalized role name

  // Human-readable description shown in the UI
  description: { type: String, required: true },

  // Additional metadata (flexible)
  metadata: { type: Schema.Types.Mixed },

}, {
  timestamps: true,
});

// Index for fetching history for a driver in reverse-chronological order
driverHistorySchema.index({ driverId: 1, createdAt: -1 });

const DriverHistory = mongoose.model('DriverHistory', driverHistorySchema);
module.exports = DriverHistory;
module.exports.schema = driverHistorySchema;
