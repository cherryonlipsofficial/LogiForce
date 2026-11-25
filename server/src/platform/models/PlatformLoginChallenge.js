/**
 * PlatformLoginChallenge — the second step of a platform sign-in.
 * Collection: 'platform_login_challenges' (platform DB only).
 *
 * A correct email + password creates one challenge and emails a 6-digit code.
 * The client gets an opaque challenge token; only hashes are stored:
 *   tokenHash = sha256(challenge token)
 *   codeHash  = HMAC-SHA256(code), keyed with PLATFORM_JWT_SECRET
 * MongoDB deletes a challenge once expiresAt has passed (TTL index).
 *
 * Exports the schema only. Register it on the platform connection through
 * platform/models/index.js; never with mongoose.model().
 */
const { Schema } = require('mongoose');

const platformLoginChallengeSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'PlatformUser',
      required: [true, 'userId is required'],
      index: true,
    },
    tokenHash: {
      type: String,
      required: [true, 'tokenHash is required'],
      unique: true,
    },
    codeHash: {
      type: String,
      required: [true, 'codeHash is required'],
    },
    expiresAt: {
      type: Date,
      required: [true, 'expiresAt is required'],
    },
    attempts: { type: Number, default: 0 },
    resendCount: { type: Number, default: 0 },
    lastSentAt: Date,
    consumedAt: { type: Date, default: null },
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// TTL: MongoDB removes the document once expiresAt is in the past.
platformLoginChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = {
  schema: platformLoginChallengeSchema,
};
