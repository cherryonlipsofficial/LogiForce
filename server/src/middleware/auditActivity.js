const { getModel } = require('../config/modelRegistry');
const logger = require('../utils/logger');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Paths we never want to audit (noisy, read-only, or logged separately)
const SKIP_PATH_PREFIXES = [
  '/api/health',
  '/api/auth/login',        // logged separately with success/failure detail
  '/api/auth/logout',       // logged separately
  '/api/auth/refresh',
  '/api/activity-log',      // never audit the audit reader itself
  '/api/notifications/mark', // noisy and not a real mutation
];

// Top-level API segments we recognise as entity types
const ENTITY_TYPES = new Set([
  'drivers', 'clients', 'projects', 'suppliers', 'vehicles',
  'vehicle-fines', 'attendance', 'salary', 'advances', 'receivables',
  'invoices', 'credit-notes', 'simcards', 'driver-clearance',
  'driver-visas', 'users', 'roles', 'settings', 'reports',
  'guarantee-passports', 'expired-documents', 'notifications',
]);

const SENSITIVE_KEYS = new Set([
  'password', 'passwordconfirm', 'currentpassword', 'newpassword',
  'token', 'accesstoken', 'refreshtoken', 'apikey', 'secret',
]);

const sanitizeBody = (body) => {
  if (!body || typeof body !== 'object') return undefined;
  // Skip if it looks like a file buffer payload
  if (body.fileData || body.buffer) return { _redacted: 'binary' };

  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = '[redacted]';
    } else if (typeof v === 'string' && v.length > 500) {
      out[k] = v.slice(0, 500) + '…';
    } else if (v instanceof Buffer) {
      out[k] = '[binary]';
    } else {
      out[k] = v;
    }
  }
  return out;
};

const IS_OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const parseEntity = (originalUrl) => {
  // originalUrl may include query string
  const path = (originalUrl || '').split('?')[0];
  const parts = path.split('/').filter(Boolean);
  // expect: ['api', '<entity>', '<id?>', '<sub?>', ...]
  if (parts[0] !== 'api') return { entityType: null, entityId: null, subAction: null };
  const entityType = parts[1] || null;
  let entityId = null;
  let subAction = null;
  if (parts[2]) {
    if (IS_OBJECT_ID.test(parts[2])) {
      entityId = parts[2];
      subAction = parts.slice(3).join('/') || null;
    } else {
      subAction = parts.slice(2).join('/');
    }
  }
  return { entityType, entityId, subAction };
};

const buildAction = (method, entityType, subAction) => {
  const base = entityType ? entityType.replace(/-/g, '_') : 'unknown';
  if (subAction) return `${base}.${subAction.replace(/\//g, '.').replace(/-/g, '_')}`;
  if (method === 'POST') return `${base}.create`;
  if (method === 'PUT' || method === 'PATCH') return `${base}.update`;
  if (method === 'DELETE') return `${base}.delete`;
  return `${base}.mutate`;
};

const buildDescription = (method, entityType, entityId, subAction) => {
  const et = entityType || 'resource';
  const idPart = entityId ? ` ${entityId.slice(-6)}` : '';
  if (subAction) return `${method} ${et}${idPart} — ${subAction.replace(/-/g, ' ')}`;
  if (method === 'POST') return `Created ${et}${idPart}`;
  if (method === 'PUT' || method === 'PATCH') return `Updated ${et}${idPart}`;
  if (method === 'DELETE') return `Deleted ${et}${idPart}`;
  return `${method} ${et}${idPart}`;
};

const shouldSkip = (path) =>
  SKIP_PATH_PREFIXES.some((p) => path.startsWith(p));

const auditActivity = (req, res, next) => {
  if (!MUTATING_METHODS.has(req.method)) return next();
  if (shouldSkip((req.originalUrl || '').split('?')[0])) return next();

  // Snapshot request body — multer binary buffers are already on req.file(s)
  const bodySnapshot = sanitizeBody(req.body);

  res.on('finish', async () => {
    try {
      // Only log successful mutations — failures aren't state changes
      if (res.statusCode >= 400) return;
      // Need an authenticated user, otherwise nothing useful to log
      if (!req.user || !req.dbConnection) return;

      const { entityType, entityId, subAction } = parseEntity(req.originalUrl);
      // Further filter: only log known entity types (avoids noise from utility routes)
      if (entityType && !ENTITY_TYPES.has(entityType) && !entityType.startsWith('driver')) {
        // still log user/roles/settings etc; unknown types just get logged anyway
      }

      const AuditLog = getModel(req, 'AuditLog');
      const action = buildAction(req.method, entityType, subAction);
      const description = buildDescription(req.method, entityType, entityId, subAction);

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.roleId?.displayName || req.user.roleId?.name,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        action,
        entityType,
        entityId,
        description,
        metadata: {
          body: bodySnapshot,
          params: req.params,
          query: req.query,
        },
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
    } catch (err) {
      logger.error('Audit middleware write failed', {
        error: err.message,
        path: req.originalUrl,
      });
    }
  });

  next();
};

module.exports = auditActivity;
