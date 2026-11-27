/**
 * Platform (product-owner) API, mounted at /api/platform in server.js ABOVE
 * resolveTenant: none of these routes needs or reads a tenant.
 *
 * Responses use { success, message, code } for errors. The router ends with
 * its own 404 and error handler, so a request under /api/platform never falls
 * through into the tenant middleware.
 */
const express = require('express');
const logger = require('../utils/logger');
const platformAuth = require('./services/platformAuth.service');
const platformUsers = require('./services/platformUser.service');
const { TenantProvisioningError } = require('./services/tenantProvisioning.service');
const { PlatformRequestError } = require('./errors');
const platformAudit = require('./services/platformAudit.service');
const { MODULES, CORE_MODULES, getByModule, isPlatformPermission } = require('../config/permissions');
const { TENANT_ADMIN_TEMPLATE, RETIRED_TEMPLATE_KEYS } = require('../config/defaultRoles');
const {
  protectPlatform, requirePlatformPermission, requireAnyPlatformPermission,
} = require('./middleware/protectPlatform');
const {
  loginIpLimiter, loginIpEmailLimiter, otpLimiter, setPasswordLimiter,
} = require('./middleware/rateLimits');

const router = express.Router();

// Errors whose status, code and message are meant for the client.
const isClientError = (err) => err instanceof platformAuth.PlatformAuthError
  || err instanceof platformUsers.PasswordSetError
  || err instanceof TenantProvisioningError
  || err instanceof PlatformRequestError;

const sendClientError = (res, err) => res.status(err.status).json({
  success: false, message: err.message, code: err.code, ...err.extra,
});

/**
 * Run a service call and send { success: true, ...result }. A client error
 * (see isClientError) becomes { success: false, message, code } with its
 * status; anything else goes to the platform error handler below.
 */
const handle = (fn) => async (req, res, next) => {
  try {
    const result = await fn(req, res);
    return res.json({ success: true, ...result });
  } catch (err) {
    if (isClientError(err)) return sendClientError(res, err);
    return next(err);
  }
};

// ── Public: /api/platform/auth ──

router.post('/auth/login', loginIpLimiter, loginIpEmailLimiter, handle((req) =>
  platformAuth.login({ email: req.body?.email, password: req.body?.password, req })));

router.post('/auth/verify-otp', otpLimiter, handle((req) =>
  platformAuth.verifyOtp({ challengeToken: req.body?.challengeToken, code: req.body?.code, req })));

router.post('/auth/resend-otp', otpLimiter, handle((req) =>
  platformAuth.resendOtp({ challengeToken: req.body?.challengeToken, req })));

// Set-password link (invited platform users): check it, then use it.
router.get('/auth/set-password/:token', setPasswordLimiter, handle((req) =>
  platformUsers.checkPlatformSetPasswordToken(req.params.token)));

router.post('/auth/set-password', setPasswordLimiter, handle((req) =>
  platformUsers.setPlatformPasswordWithToken({ token: req.body?.token, password: req.body?.password, req })));

// ── Protected: everything below needs a platform token ──

router.use(protectPlatform);

router.get('/auth/me', (req, res) => res.json({ success: true, user: req.platformUser }));

const canReadMeta = requireAnyPlatformPermission(['platform.tenants.view', 'platform.role_templates.view']);
const canReadAudit = requirePlatformPermission('platform.audit.view');

// GET /api/platform/meta — what the console needs to draw module switches and
// the permission grid. Platform-scope permissions are left out: they can never
// be in a company's role.
router.get('/meta', canReadMeta, (req, res) => {
  const permissionsByModule = Object.fromEntries(
    Object.entries(getByModule())
      .map(([mod, perms]) => [mod, perms.filter((p) => !isPlatformPermission(p.key))])
      .filter(([, perms]) => perms.length > 0)
  );
  res.json({
    success: true,
    modules: MODULES,
    coreModules: CORE_MODULES,
    permissionsByModule,
    tenantAdminTemplateKey: TENANT_ADMIN_TEMPLATE.key,
    retiredTemplateKeys: RETIRED_TEMPLATE_KEYS,
  });
});

// Each route checks its own platform permission.
router.use('/tenants', require('./routes/tenants.routes'));
router.use('/role-templates', require('./routes/roleTemplates.routes'));

// GET /api/platform/audit-logs?page=&limit=&action=&targetType=&targetKey=&actor=&from=&to=
router.get('/audit-logs', canReadAudit, handle((req) => platformAudit.listAuditLogs(req.query)));
router.get('/audit-logs/actions', canReadAudit, handle(() => platformAudit.listAuditActions()));

// ── Unknown paths and errors stay inside the platform router ──

router.use((req, res) => res.status(404).json({
  success: false,
  message: 'Not found',
  code: 'PLATFORM_NOT_FOUND',
}));

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (isClientError(err)) return sendClientError(res, err);
  logger.error('Platform request failed', {
    error: err.message,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    platformUserId: req.platformUser?._id,
    stack: err.stack,
  });
  return res.status(500).json({ success: false, message: 'Internal server error', code: 'PLATFORM_ERROR' });
});

module.exports = router;
