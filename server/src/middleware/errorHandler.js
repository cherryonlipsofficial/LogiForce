const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log with request context
  logger.error(message, {
    statusCode,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userId: req.user?._id,
    ...(statusCode === 500 && { stack: err.stack }),
  });

  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
