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

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
