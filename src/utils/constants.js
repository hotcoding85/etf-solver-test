/**
 * Application constants
 */
module.exports = {
  // Rate limiting for Binance API
  RATE_LIMIT: 100, // 100 orders per window
  RATE_LIMIT_WINDOW_MS: 10000, // 10 seconds window
  
  // Minimum asset purchase amount in USD
  MIN_ASSET_PURCHASE: 5, // $5 minimum per asset
  
  // Index parameters
  DEFAULT_INDEX_PRICE: 1000, // Initial index price
  
  // Fees
  TRADING_FEE_PERCENT: 0.1, // 0.1% trading fee
  
  // Order settings
  DEFAULT_BATCH_SIZE: 10,
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Server
  PORT: process.env.PORT || 5000,
  HOST: '0.0.0.0'
};
