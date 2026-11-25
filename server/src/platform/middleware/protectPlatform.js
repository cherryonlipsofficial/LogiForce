/**
 * Auth middleware for platform (product-owner) routes.
 *
 * protectPlatform accepts only platform JWTs: signed with PLATFORM_JWT_SECRET
 * (HS256), audience 'platform', issuer 'logiforce-platform', and carrying the
 * user's current tokenVersion. A tenant token fails here, and a platform token
 * fails the tenant protect() (different secret).
 *
 * It sets req.platformUser and never req.user, so tenant permission checks
 * can't mistake a platform user for a company user.
 */
const { getPlatformModels } = require('../models');
const { verifyPlatformToken } = require('../services/platformAuth.service');

const OBJECT_ID = /^[a-f0-9]{24}$/i;

const notAuthorized = (res) => res.status(401).json({
  success: false,
  message: 'Not authorized',
  code: 'PLATFORM_AUTH_REQUIRED',
});

const protectPlatform = async (req, res, next) => {
  // Same token source as the tenant protect() in middleware/auth.js.
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return notAuthorized(res);

  let decoded;
  try {
    decoded = verifyPlatformToken(token);
  } catch {
    return notAuthorized(res);
  }

  if (!decoded || typeof decoded.sub !== 'string' || !OBJECT_ID.test(decoded.sub) || !Number.isInteger(decoded.tv)) {
    return notAuthorized(res);
  }

  // A database error is not an auth failure: let it reach the error handler (500).
  const { PlatformUser } = getPlatformModels();
  const user = await PlatformUser.findById(decoded.sub).select('email name role status tokenVersion').lean();

  if (!user || user.status !== 'active' || decoded.tv !== (user.tokenVersion ?? 0)) {
    return notAuthorized(res);
  }

  // Role comes from the database, so a role change applies to existing tokens at once.
  req.platformUser = { _id: user._id, email: user.email, name: user.name, role: user.role };
  return next();
};

/**
 * requirePlatformRole('owner') or requirePlatformRole('owner', 'support').
 * Use after protectPlatform.
 */
const requirePlatformRole = (...roles) => {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.platformUser) return notAuthorized(res);
    if (!allowed.includes(req.platformUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this action',
        code: 'PLATFORM_FORBIDDEN',
      });
    }
    return next();
  };
};

module.exports = { protectPlatform, requirePlatformRole };
