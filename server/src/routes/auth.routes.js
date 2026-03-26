const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/auth');
const authService = require('../services/auth.service');
const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils/responseHelper');
const validate = require('../middleware/validate');
const { loginValidation, registerValidation, changePasswordValidation } = require('../middleware/validators/auth.validators');

// Rate limit on login: 5 requests per minute
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many login attempts. Please try again after 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/register — admin only in production
router.post('/register', validate(registerValidation), async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    // In production, only admins can register new users
    try {
      await new Promise((resolve, reject) => {
        protect(req, res, (err) => (err ? reject(err) : resolve()));
      });
      if (req.user.roleId?.name !== 'admin') {
        return sendError(res, 'Only admins can register users', 403);
      }
    } catch {
      return sendError(res, 'Authentication required', 401);
    }
  }

  const { token, user } = await authService.register(req.body);
  sendSuccess(res, { token, user }, 201);
});

// POST /api/auth/login
router.post('/login', loginLimiter, validate(loginValidation), async (req, res) => {
  const { email, password } = req.body;
  const { token, user } = await authService.login(email, password);
  sendSuccess(res, { token, user });
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user.id).populate('roleId');
  if (!user) return sendError(res, 'User not found', 404);
  const permissions = await user.getPermissions();
  sendSuccess(res, { ...user.toJSON(), permissions });
});

// PUT /api/auth/change-password
router.put('/change-password', protect, validate(changePasswordValidation), async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    return sendError(res, 'Current password is incorrect', 401);
  }

  user.password = newPassword;
  await user.save();
  sendSuccess(res, { message: 'Password changed successfully' });
});

module.exports = router;
