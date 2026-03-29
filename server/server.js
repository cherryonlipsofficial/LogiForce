require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const connectDB = require('./src/config/db');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'https://logi-force.vercel.app',
  credentials: true,
}));
app.use(helmet());

// Morgan logging: combined format to file in production, dev format to console otherwise
if (process.env.NODE_ENV === 'production') {
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const accessLogStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });
  app.use(morgan('combined', { stream: accessLogStream }));
} else {
  app.use(morgan('dev'));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/drivers', require('./src/routes/drivers.routes'));
app.use('/api/clients', require('./src/routes/clients.routes'));
app.use('/api/suppliers', require('./src/routes/suppliers.routes'));
app.use('/api/attendance', require('./src/routes/attendance.routes'));
app.use('/api/invoices', require('./src/routes/invoices.routes'));
app.use('/api/reports', require('./src/routes/reports.routes'));
app.use('/api/advances', require('./src/routes/advances.routes'));
app.use('/api/salary', require('./src/routes/salary.routes'));
app.use('/api/vehicles', require('./src/routes/vehicles.routes'));
app.use('/api/projects', require('./src/routes/projects.routes'));
app.use('/api/roles', require('./src/routes/roles.routes'));
app.use('/api/users', require('./src/routes/users.routes'));
app.use('/api', require('./src/routes/guaranteePassport.routes'));
app.use('/api/notifications', require('./src/routes/notifications.routes'));
app.use('/api/settings', require('./src/routes/settings.routes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);

  // Nightly guarantee passport expiry check at 01:00 AM
  const cron = require('node-cron');
  const { runExpiryCheck } = require('./src/services/guaranteePassport.service');

  cron.schedule('0 1 * * *', async () => {
    console.log('Running guarantee passport expiry check...');
    try {
      const result = await runExpiryCheck();
      console.log(`Expiry check complete: ${result.expiredCount} expired`);
    } catch (err) {
      console.error('Expiry check failed:', err.message);
    }
  });
});
