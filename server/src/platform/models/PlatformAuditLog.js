/**
 * PlatformAuditLog — append-only record of platform-level changes.
 * Collection: 'platform_audit_logs' (platform DB only).
 *
 * Every Mongoose path that could modify or delete an entry throws
 * "Audit log is append-only". (Raw driver access through Model.collection is
 * not covered; database-level enforcement would need a MongoDB role.)
 *
 * Exports the schema only. Register it on the platform connection through
 * platform/models/index.js; never with mongoose.model().
 */
const { Schema } = require('mongoose');

const APPEND_ONLY_MESSAGE = 'Audit log is append-only';
const TARGET_TYPES = Object.freeze(['Tenant', 'RoleTemplate', 'PlatformUser', 'PlatformRole']);

// Keys removed from before/after snapshots at any depth: passwordHash, password,
// token and anything else whose name contains "password" or "token"
// (e.g. passwordResetTokenHash, refreshToken).
const SENSITIVE_KEY = /password|token/i;

const platformAuditLogSchema = new Schema(
  {
    actor: {
      userId: { type: Schema.Types.ObjectId, ref: 'PlatformUser', default: null },
      email: { type: String, required: [true, 'actor.email is required'] }, // 'system' for scripts
    },
    // e.g. 'tenant.create', 'tenant.update', 'tenant.suspend',
    //      'roleTemplate.create', 'roleTemplate.update', 'platformUser.create'
    action: { type: String, required: [true, 'action is required'] },
    targetType: { type: String, enum: TARGET_TYPES, required: [true, 'targetType is required'] },
    targetId: { type: Schema.Types.ObjectId, required: [true, 'targetId is required'] },
    // Tenant key, role key or email, so the log reads without a join
    targetKey: String,
    // The company the change concerns, if any (set for every Tenant target),
    // so one company's history can be listed.
    tenantKey: { type: String, default: null },
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

platformAuditLogSchema.index({ createdAt: -1 });
platformAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
platformAuditLogSchema.index({ 'actor.userId': 1, createdAt: -1 });
platformAuditLogSchema.index({ tenantKey: 1, createdAt: -1 });

// ── Append-only enforcement ──

const rejectMutation = () => {
  throw new Error(APPEND_ONLY_MESSAGE);
};

// Model.updateOne(), Query#deleteMany(), findByIdAndUpdate(), ...
platformAuditLogSchema.pre(
  [
    'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne',
    'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace',
  ],
  { query: true, document: false },
  rejectMutation
);

// doc.updateOne(), doc.deleteOne()
platformAuditLogSchema.pre(['updateOne', 'deleteOne'], { document: true, query: false }, rejectMutation);

// doc.save() on an entry that already exists
platformAuditLogSchema.pre('save', function () {
  if (!this.isNew) throw new Error(APPEND_ONLY_MESSAGE);
});

// Model.bulkWrite(): inserts are fine, anything else is not
platformAuditLogSchema.pre('bulkWrite', function (next, ops) {
  const ok = Array.isArray(ops) && ops.every((op) => op && Object.keys(op).length === 1 && op.insertOne);
  next(ok ? undefined : new Error(APPEND_ONLY_MESSAGE));
});

// ── Recording ──

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * Deep copy of a snapshot without sensitive fields. Mongoose documents become
 * plain objects; ObjectIds, Dates and other non-plain values are kept as-is.
 */
const stripSensitive = (value, seen = new WeakSet()) => {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toObject === 'function' && !Array.isArray(value)) {
    // Mongoose document / subdocument. ObjectId has no toObject.
    return stripSensitive(value.toObject({ depopulate: true }), seen);
  }
  if (seen.has(value)) return '[Circular]';

  if (Array.isArray(value)) {
    seen.add(value);
    return value.map((item) => stripSensitive(item, seen));
  }
  if (isPlainObject(value)) {
    seen.add(value);
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(k)) continue;
      out[k] = stripSensitive(v, seen);
    }
    return out;
  }
  return value; // ObjectId, Date, Buffer, Decimal128, ...
};

/**
 * Append an entry.
 *
 * @param {object}  entry
 * @param {{userId?: ObjectId|null, email: string}} entry.actor  { userId: null, email: 'system' } for scripts
 * @param {string}  entry.action      e.g. 'tenant.create'
 * @param {string}  entry.targetType  'Tenant' | 'RoleTemplate' | 'PlatformUser'
 * @param {ObjectId} entry.targetId
 * @param {string}  [entry.targetKey] tenant key, role key or email
 * @param {string}  [entry.tenantKey] company concerned; defaults to targetKey for a Tenant target
 * @param {*}       [entry.before]    snapshot before the change (sensitive fields stripped)
 * @param {*}       [entry.after]     snapshot after the change (sensitive fields stripped)
 * @param {import('express').Request} [entry.req] source of ip and user-agent
 */
platformAuditLogSchema.statics.record = function record({
  actor, action, targetType, targetId, targetKey, tenantKey, before, after, req,
} = {}) {
  const entry = {
    actor: { userId: actor?.userId ?? null, email: actor?.email },
    action,
    targetType,
    targetId,
    targetKey,
    tenantKey: tenantKey ?? (targetType === 'Tenant' ? targetKey ?? null : null),
    before: stripSensitive(before),
    after: stripSensitive(after),
  };

  if (req) {
    entry.ip = req.ip;
    entry.userAgent = typeof req.get === 'function' ? req.get('user-agent') : req.headers?.['user-agent'];
  }

  return this.create(entry);
};

module.exports = {
  schema: platformAuditLogSchema,
  TARGET_TYPES,
  APPEND_ONLY_MESSAGE,
  stripSensitive,
};
