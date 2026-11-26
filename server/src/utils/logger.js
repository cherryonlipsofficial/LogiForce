const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'logiforce-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length > 1 ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    }),
  ],
});

// Add file transport in production. On hosts like Render the filesystem may be
// read-only or ephemeral, so file logging is best-effort: set LOG_TO_FILE=false
// to disable it, or LOG_DIR to change the location. Console logging always works.
if (process.env.NODE_ENV === 'production' && process.env.LOG_TO_FILE !== 'false') {
  const fs = require('fs');
  const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.accessSync(logDir, fs.constants.W_OK);

    logger.add(new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }));
    logger.add(new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }));
  } catch (err) {
    logger.warn(`File logging disabled: cannot write to ${logDir} (${err.code || err.message}). Logging to console only.`);
  }
}

module.exports = logger;
