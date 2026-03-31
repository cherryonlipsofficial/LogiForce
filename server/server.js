require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const connectDB = require('./src/config/db');
const errorHandler = require('./src/middleware/errorHandler');
const logger = require('./src/utils/logger');

const app = express();

// Connect to MongoDB
connectDB();

// CORS — supports comma-separated origins in CLIENT_URL
const allowedOrigins = (process.env.CLIENT_URL || 'https://logi-force.vercel.app')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, health checks)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(helmet());
app.disable('x-powered-by');

// Morgan logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  // In production, use short format to stdout — Winston handles structured logging
  app.use(morgan('short'));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global API rate limiter — 200 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again shortly.' },
  skip: (req) => req.path === '/api/health',
});

app.use('/api', apiLimiter);

// Prevent caching on API responses
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  next();
});

// Routes
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/drivers', require('./src/routes/drivers.routes'));
app.use('/api/clients', require('./src/routes/clients.routes'));
app.use('/api/suppliers', require('./src/routes/suppliers.routes'));
app.use('/api/attendance', require('./src/routes/attendance.routes'));
app.use('/api/invoices', require('./src/routes/invoices.routes'));
app.use('/api/credit-notes', require('./src/routes/creditNotes.routes'));
app.use('/api/reports', require('./src/routes/reports.routes'));
app.use('/api/advances', require('./src/routes/advances.routes'));
app.use('/api/salary', require('./src/routes/salary.routes'));
app.use('/api/receivables', require('./src/routes/driverReceivables.routes'));
app.use('/api/vehicles', require('./src/routes/vehicles.routes'));
app.use('/api/projects', require('./src/routes/projects.routes'));
app.use('/api/roles', require('./src/routes/roles.routes'));
app.use('/api/users', require('./src/routes/users.routes'));
app.use('/api', require('./src/routes/guaranteePassport.routes'));
app.use('/api/notifications', require('./src/routes/notifications.routes'));
app.use('/api/settings', require('./src/routes/settings.routes'));

// Deep health check
app.get('/api/health', async (req, res) => {
  const mongoState = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const isHealthy = mongoState === 1;

  const health = {
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    mongodb: isHealthy ? 'connected' : 'disconnected',
  };

  res.status(isHealthy ? 200 : 503).json(health);
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on port ${PORT}`);

  // Nightly guarantee passport expiry check at 01:00 AM
  const cron = require('node-cron');
  const { runExpiryCheck } = require('./src/services/guaranteePassport.service');

  cron.schedule('0 1 * * *', async () => {
    logger.info('Running guarantee passport expiry check...');
    try {
      const result = await runExpiryCheck();
      logger.info(`Expiry check complete: ${result.expiredCount} expired`);
    } catch (err) {
      logger.error('Expiry check failed', { error: err.message, stack: err.stack });
    }
  });

  // Daily salary approval reminder at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    logger.info('Running salary approval reminder check...');
    try {
      const { checkAndSendReminders } = require('./src/services/salaryReminder.service');
      const result = await checkAndSendReminders();
      logger.info(`Salary reminders sent: ${result.notificationsSent}`);
    } catch (err) {
      logger.error('Salary reminder check failed', { error: err.message, stack: err.stack });
    }
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Close MongoDB connection
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (err) {
    logger.error('Error closing MongoDB', { error: err.message });
  }

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});
