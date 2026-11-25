/**
 * Rate limits for the public platform auth routes (sign-in and set-password).
 *
 * They key on req.ip, which is the real client IP only because server.js sets
 * app.set('trust proxy', 1) (one proxy in front: Render, or nginx in
 * docker-compose). The store is in memory, per server process.
 */
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { normalizeEmail } = require('../services/platformUser.service');

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const rateLimited = (req, res, next, options) => res.status(options.statusCode).json({
  success: false,
  message: 'Too many requests. Please try again later.',
  code: 'RATE_LIMITED',
});

const base = {
  windowMs: FIFTEEN_MINUTES,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimited,
};

// POST /auth/login: 20 per 15 min per IP ...
const loginIpLimiter = rateLimit({ ...base, limit: 20 });

// ... and 5 per 15 min per IP + email.
const loginIpEmailLimiter = rateLimit({
  ...base,
  limit: 5,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
    return `${ipKeyGenerator(req.ip)}|${email}`;
  },
});

// POST /auth/verify-otp and /auth/resend-otp share one budget: 10 per 15 min per IP.
const otpLimiter = rateLimit({ ...base, limit: 10 });

// GET/POST /auth/set-password share one budget: 10 per 15 min per IP.
const setPasswordLimiter = rateLimit({ ...base, limit: 10 });

module.exports = { loginIpLimiter, loginIpEmailLimiter, otpLimiter, setPasswordLimiter };
