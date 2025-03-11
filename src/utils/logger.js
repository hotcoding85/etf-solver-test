const winston = require('winston');
const { LOG_LEVEL } = require('./constants');

/**
 * Configure Winston logger
 */
const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'etf-solver' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...metadata }) => {
          let meta = '';
          if (Object.keys(metadata).length > 0 && metadata.service) {
            meta = JSON.stringify(metadata);
          }
          return `${timestamp} [${level}]: ${message} ${meta}`;
        })
      )
    })
  ]
});

// Export the logger
module.exports = logger;
