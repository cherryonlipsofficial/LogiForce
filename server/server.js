require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
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
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./src/routes/auth.routes'));
// app.use('/api/drivers', require('./src/routes/drivers'));
// app.use('/api/attendance', require('./src/routes/attendance'));
// app.use('/api/salary', require('./src/routes/salary'));
// app.use('/api/invoices', require('./src/routes/invoices'));
// app.use('/api/clients', require('./src/routes/clients'));
// app.use('/api/suppliers', require('./src/routes/suppliers'));
// app.use('/api/reports', require('./src/routes/reports'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
