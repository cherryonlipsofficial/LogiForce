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
const { protectPlatform } = require('./middleware/protectPlatform');
const { loginIpLimiter, loginIpEmailLimiter, otpLimiter } = require('./middleware/rateLimits');

const router = express.Router();

/**
 * Run a service call and send { success: true, ...result }. A PlatformAuthError
 * becomes { success: false, message, code } with its status; anything else goes
 * to the platform error handler below.
 */
const handle = (fn) => async (req, res, next) => {
  try {
    const result = await fn(req, res);
    return res.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof platformAuth.PlatformAuthError) {
      return res.status(err.status).json({ success: false, message: err.message, code: err.code, ...err.extra });
    }
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

// ── Protected: everything below needs a platform token ──

router.use(protectPlatform);

router.get('/auth/me', (req, res) => res.json({ success: true, user: req.platformUser }));

// Coming in later steps (import requirePlatformRole from ./middleware/protectPlatform):
// router.use('/tenants', requirePlatformRole('owner'), require('./routes/tenants.routes'));
// router.use('/role-templates', requirePlatformRole('owner'), require('./routes/roleTemplates.routes'));

// ── Unknown paths and errors stay inside the platform router ──

router.use((req, res) => res.status(404).json({
  success: false,
  message: 'Not found',
  code: 'PLATFORM_NOT_FOUND',
}));

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  logger.error('Platform request failed', {
    error: err.message,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    platformUserId: req.platformUser?._id,
    stack: err.stack,
  });
  res.status(500).json({ success: false, message: 'Internal server error', code: 'PLATFORM_ERROR' });
});

module.exports = router;
