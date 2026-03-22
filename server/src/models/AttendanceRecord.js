const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AttendanceBatch',
      required: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },
    period: {
      year: { type: Number },
      month: { type: Number },
    },
    workingDays: {
      type: Number,
      required: [true, 'Working days is required'],
    },
    overtimeHours: {
      type: Number,
      default: 0,
    },
    rawEmployeeCode: {
      type: String,
    },
    status: {
      type: String,
      enum: ['valid', 'warning', 'error', 'overridden'],
      default: 'valid',
    },
    issues: [String],
    overrideReason: {
      type: String,
    },
    overrideBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('AttendanceRecord', attendanceRecordSchema);
