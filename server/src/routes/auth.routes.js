const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const authService = require('../services/auth.service');
const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils/responseHelper');

// POST /api/auth/register — admin only in production
router.post('/register', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    // In production, only admins can register new users
    try {
      await new Promise((resolve, reject) => {
        protect(req, res, (err) => (err ? reject(err) : resolve()));
      });
      if (req.user.role !== 'admin') {
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
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return sendError(res, 'Please provide email and password', 400);
  }
  const { token, user } = await authService.login(email, password);
  sendSuccess(res, { token, user });
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return sendError(res, 'User not found', 404);
  sendSuccess(res, user);
});

// PUT /api/auth/change-password
router.put('/change-password', protect, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return sendError(res, 'Please provide current and new password', 400);
  }

  const user = await User.findById(req.user.id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    return sendError(res, 'Current password is incorrect', 401);
  }

  user.password = newPassword;
  await user.save();
  sendSuccess(res, { message: 'Password changed successfully' });
});

module.exports = router;
